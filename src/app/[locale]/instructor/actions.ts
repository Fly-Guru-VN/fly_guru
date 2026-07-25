"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppUser, ROLE_HOME, type AppUser } from "@/lib/auth";
import {
  phoneDigits,
  phonesMatch,
  isValidPhone,
  normalizeTelegram,
  PHONE_ERROR,
} from "@/lib/phone";
import { vnToday, subscriptionExpiry } from "@/lib/dates";
import { minutesLeft } from "@/lib/subscriptions";
import { parseVnd } from "@/lib/money";
import { checkPhoto } from "@/lib/photos";
import { agentRewardApplies, applyRefDiscount } from "@/lib/agentReward";

// Server actions кабинета инструктора. Общий принцип безопасности:
// instructor_id / sold_by / created_by берутся из СЕССИИ на сервере (user.id),
// а не из формы — подделать чужой id нельзя. Вторым рубежом это же проверяет
// RLS (политики sessions_insert_instructor и т.п.).

export interface ActionState {
  error: string | null;
}

// Скидка по агентской реф-ссылке и правила награды агента живут в
// lib/agentReward: их должны одинаково понимать и кабинет, и админка.

async function requireStaff(): Promise<AppUser> {
  const user = await getAppUser();
  if (!user || (user.role !== "instructor" && user.role !== "admin")) {
    redirect("/login?next=/instructor");
  }
  return user;
}

// Часть экранов кабинета один в один переиспользует механик: смена с
// фотофиксацией, свои расходы, настройки профиля. Отдельная проверка (а не
// «пустить механика в requireStaff») намеренно: денежные действия — запись
// клиента, продажа абонемента, списание минут, правка сессии — остаются за
// инструктором, и RLS это подтверждает второй раз.
async function requireFieldStaff(): Promise<AppUser> {
  const user = await getAppUser();
  if (
    !user ||
    (user.role !== "instructor" && user.role !== "mechanic" && user.role !== "admin")
  ) {
    redirect("/login?next=/instructor");
  }
  return user;
}

// Тот же экран лежит по двум адресам (/instructor/... и /mechanic/...) —
// revalidatePath должен указывать на кабинет того, кто нажал кнопку, иначе
// человек увидит старые данные.
function cabinetBase(user: AppUser): string {
  return user.role === "mechanic" ? "/mechanic" : "/instructor";
}

// Найти клиента по телефону (гибкое сравнение цифр) или создать нового.
// Телефоны в заявках с сайта лежат «как ввёл гость», поэтому сравниваем в JS.
// Клиентов у школы сотни, не миллионы — выборка дешёвая; если база вырастет,
// на этапе 4 добавим нормализованную колонку и индекс.
async function findOrCreateClient(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: AppUser,
  input: {
    name: string;
    phone: string;
    source: "site" | "offline";
    city?: string | null;
    telegram?: string | null;
    referrer?: { type: "agent"; id: string } | null;
  },
): Promise<{ id: string; existingName?: string } | { error: string }> {
  const { data: existing, error: selError } = await supabase
    .from("clients")
    .select("id, name, phone, telegram_username")
    .not("phone", "is", null)
    .limit(1000);
  if (selError) return { error: `Не удалось найти клиента: ${selError.message}` };

  // Телефон уже есть в базе → это тот же человек, вторую карточку не заводим.
  // Введённое имя при этом НЕ перезаписывает старое — сообщаем вызвавшему,
  // на кого реально легла запись (иначе кажется, что клиент «потерялся»).
  const match = (existing ?? []).find((c) => phonesMatch(c.phone, input.phone));
  if (match) {
    // Ник в телеге дописываем, только если его ещё нет: у постоянного клиента
    // в карточке может стоять выверенный контакт, и затирать его случайной
    // опечаткой из сегодняшней формы нельзя.
    if (input.telegram && !match.telegram_username) {
      await supabase
        .from("clients")
        .update({ telegram_username: input.telegram })
        .eq("id", match.id);
    }
    return { id: match.id, existingName: match.name ?? undefined };
  }

  const { data: created, error: insError } = await supabase
    .from("clients")
    .insert({
      name: input.name,
      phone: phoneDigits(input.phone) || input.phone,
      city: input.city || null,
      telegram_username: input.telegram || null,
      source: input.referrer ? "agent" : input.source,
      referrer_type: input.referrer?.type ?? null,
      referrer_id: input.referrer?.id ?? null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (insError || !created) {
    return { error: `Не удалось создать клиента: ${insError?.message ?? "?"}` };
  }
  return { id: created.id };
}

// ── Записи (подтверждённые админом заявки) ───────────────────────────────────
// «Принять»: запись закрепляется за мной. Условия .is("accepted_by", null) и
// .eq("status", "confirmed") защищают от гонки — если двое нажали одновременно,
// база возьмёт только первого, у второго update просто не найдёт строку.
export async function acceptBookingAction(formData: FormData) {
  const user = await requireStaff();
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await supabase
    .from("bookings")
    .update({ accepted_by: user.id, accepted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "confirmed")
    .is("accepted_by", null);

  // Перерисовать счётчики (кнопка «Записи», бейдж в шапке) везде.
  revalidatePath("/", "layout");
}

// «Отказаться»: вернуть запись в общий пул (только свою).
export async function declineBookingAction(formData: FormData) {
  const user = await requireStaff();
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await supabase
    .from("bookings")
    .update({ accepted_by: null, accepted_at: null })
    .eq("id", id)
    .eq("accepted_by", user.id);

  revalidatePath("/", "layout");
}

// ── «Записать клиента» ────────────────────────────────────────────────────────
export async function recordClientAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireStaff();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const serviceId = String(formData.get("serviceId") ?? "");
  // Инструктор работает только в рамках сегодняшнего дня: дату занятия НЕ
  // берём из формы (её там больше нет), а жёстко ставим текущий день по
  // Вьетнаму. Записи задним/будущим числом оформляет только админ. Ошибся
  // инструктор — сообщает админу, тот правит через админку.
  const date = vnToday();
  const bookingId = String(formData.get("bookingId") ?? "") || null;
  // Формат оплаты обязателен (пак A, пункт 6). Проверяем и на сервере, а не
  // только через required в разметке: required обходится, а дыра в отчёте
  // «чем платят» потом не восстанавливается.
  const paymentMethodId = String(formData.get("paymentMethodId") ?? "").trim();

  if (!name || !phone || !serviceId) {
    return { error: "Заполните имя, телефон и услугу." };
  }
  // Длину номера проверяем и на сервере: в разметке она подсказка, здесь —
  // правило. Кривой номер = потерянный клиент, чинить его потом некому.
  if (!isValidPhone(phone)) {
    return { error: PHONE_ERROR };
  }
  if (!paymentMethodId) {
    return { error: "Укажите формат оплаты." };
  }

  // Реф-код берём из ЗАЯВКИ на сервере (не из формы — там его можно подменить).
  let refCode: string | null = null;
  if (bookingId) {
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, status, ref_code, services(category)")
      .eq("id", bookingId)
      .maybeSingle();
    if (!booking) return { error: "Заявка не найдена." };
    // Уже оформленную заявку вторично не проводим: повторный сабмит (кнопка
    // «Назад», зависшая вкладка) записывал второе занятие и вторую награду
    // агенту — чек задваивался в выручке и в ЗП.
    if (booking.status === "done") {
      return { error: "Эта заявка уже оформлена — занятие записано." };
    }
    // Заявку на абонемент сессией не проводим: список услуг здесь без
    // абонемента, и она молча падала бы на базовое обучение, а абонемент не
    // создавался (пачка №5, п.11). Отправляем на «Продать абонемент».
    if ((booking.services as unknown as { category?: string } | null)?.category === "subscription") {
      return { error: "Это заявка на абонемент — оформите её через «Продать абонемент»." };
    }
    refCode = booking.ref_code ?? null;
  }

  // Резолвим реф-код → агент. Коды членов клуба появятся на этапе 5 —
  // TODO(этап 5): искать код и среди членов, награда минутами (+10/+30).
  let agent: { id: string; commission_fixed: number } | null = null;
  if (refCode) {
    const { data } = await supabase
      .from("agents")
      .select("id, commission_fixed")
      .eq("ref_code", refCode)
      .eq("active", true)
      .maybeSingle();
    agent = data ?? null;
  }

  const clientResult = await findOrCreateClient(supabase, user, {
    name,
    phone,
    city,
    telegram: normalizeTelegram(formData.get("telegramUsername") as string),
    source: bookingId ? "site" : "offline",
    referrer: agent ? { type: "agent", id: agent.id } : null,
  });
  if ("error" in clientResult) return { error: clientResult.error };
  const clientId = clientResult.id;

  const { data: service } = await supabase
    .from("services")
    .select("id, name, price, category, code")
    .eq("id", serviceId)
    .maybeSingle();
  if (!service) return { error: "Услуга не найдена." };
  // Абонемент сессией не оформить: без своей формы клиент не получит минуты,
  // членство и отметку оплаты. Дубль-защита к фильтру списка на странице.
  if (service.category === "subscription") {
    return { error: "Абонемент оформляется через «Продажу абонемента»." };
  }

  // Заработал ли агент на этом занятии: только первое базовое обучение
  // клиента (в т.ч. парное). Личный код инструктора скидки и награды не даёт —
  // поэтому смотрим на распознанного агента, а не на сам факт ref_code.
  // Одно решение на троих: скидка клиенту, комиссия на сессии, награда агенту.
  //
  // Считаем service-role клиентом, а не своим: RLS (sessions_select_instructor)
  // отдаёт инструктору ТОЛЬКО его сессии. Значит базовое обучение, которое тот
  // же клиент прошёл у напарника, для него невидимо — и проверка «первый раз?»
  // отвечала «да». Итог: агенту вторые 300 000 ₫ и клиенту вторая скидка за то
  // же самое. Наружу из проверки уходит только «да/нет», чужих сумм не видно.
  const rewarded = await agentRewardApplies(createAdminClient(), {
    hasAgent: Boolean(agent),
    serviceCode: service.code as string | null,
    clientId,
  });

  const amount = applyRefDiscount(Number(service.price ?? 0), rewarded);
  const discounted = rewarded;

  // Комиссию агента фиксируем на сессии: из неё вычтется база инструктора
  // (15% с чека минус комиссия). См. миграцию 0021.
  const { error: sessionError } = await supabase.from("sessions").insert({
    client_id: clientId,
    service_id: service.id,
    instructor_id: user.id,
    date,
    amount,
    agent_commission: rewarded ? agent!.commission_fixed : 0,
    payment_method_id: paymentMethodId,
    note: String(formData.get("note") ?? "").trim() || null,
    created_by: user.id,
  });
  if (sessionError) return { error: `Не удалось записать: ${sessionError.message}` };

  // Награда агенту — за первое базовое обучение приведённого клиента. Занятие
  // проведено и оплачено прямо сейчас — это и есть подтверждение, поэтому
  // пишем сразу `confirmed` (иначе награда зависала бы pending, клиент везде
  // «оплатил», а в расчёте месяца агенту 0). Размер фиксированный
  // (commission_fixed), считается независимо от чека.
  if (rewarded) {
    const { error: rewardError } = await supabase.from("referral_rewards").insert({
      referrer_type: "agent",
      referrer_id: agent!.id,
      client_id: clientId,
      reward_type: "money",
      amount: agent!.commission_fixed,
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
    });
    if (rewardError) {
      // Сессия уже записана — не роняем оформление, но проговариваем проблему.
      console.error("[instructor] reward insert error:", rewardError.message);
    }
  }

  // Заявка доведена до занятия → закрываем её и привязываем клиента. Заодно
  // возвращаем в заявку способ оплаты, которым клиент расплатился: админу
  // видно это прямо в ленте заявок, не открывая сессии.
  if (bookingId) {
    await supabase
      .from("bookings")
      .update({
        status: "done",
        client_id: clientId,
        payment_method_id: paymentMethodId,
      })
      .eq("id", bookingId);
  }

  // Сбрасываем кэш страниц перед уходом на экран «Готово» (пачка №6, п.3).
  // Без этого инструктор, вернувшийся со страницы «Готово» назад к «Записям»,
  // видел сохранённую браузером копию списка — заявка, которую он только что
  // закрыл, оставалась в ленте до ручного обновления. На телефоне это заметнее
  // всего: там кнопкой «назад» пользуются постоянно.
  revalidatePath("/", "layout");

  const params = new URLSearchParams({
    type: "session",
    name,
    amount: String(amount),
    service: service.name,
  });
  if (discounted) params.set("discount", "1");
  if (clientResult.existingName) params.set("existing", clientResult.existingName);
  redirect(`/instructor/done?${params.toString()}`);
}

// ── Продажа абонемента ────────────────────────────────────────────────────────
export async function sellSubscriptionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireStaff();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const paid = formData.get("paid") === "on";
  // Пришли из заявки на абонемент — закроем её после продажи (пачка №5, п.11).
  const bookingId = String(formData.get("bookingId") ?? "") || null;
  // Чем заплатили. Обязателен ровно тогда, когда деньги получены: продажа
  // «оплатит позже» способа оплаты ещё не имеет. Проверяем на сервере — в
  // разметке required обходится, а дыру в отчёте потом не залатать.
  const paymentMethodId =
    String(formData.get("paymentMethodId") ?? "").trim() || null;

  if (!name || !phone) return { error: "Заполните имя и телефон." };
  if (paid && !paymentMethodId) return { error: "Укажите формат оплаты." };

  // Уже оформленную заявку вторично не проводим — та же защита, что в
  // recordClientAction, только там её поставили, а здесь забыли. Повторный
  // сабмит (кнопка «Назад», зависшая вкладка со старым ?booking=id) создавал
  // ВТОРОЙ абонемент на 6 млн: он задваивался и в выручке, и в котле 15%,
  // а у клиента появлялись лишние 300 минут.
  if (bookingId) {
    const { data: booking } = await supabase
      .from("bookings")
      .select("status")
      .eq("id", bookingId)
      .maybeSingle();
    if (!booking) return { error: "Заявка не найдена." };
    if (booking.status === "done") {
      return { error: "Эта заявка уже оформлена — абонемент продан." };
    }
  }

  const clientResult = await findOrCreateClient(supabase, user, {
    name,
    phone,
    telegram: normalizeTelegram(formData.get("telegramUsername") as string),
    source: bookingId ? "site" : "offline",
  });
  if ("error" in clientResult) return { error: clientResult.error };
  const clientId = clientResult.id;

  // total_minutes (300) и price (6 млн) заданы default'ами в схеме.
  // Минуты живут 3 месяца с продажи. paid_at пишем только при полученной
  // оплате — от него зависит комиссия инструктора (см. 0002).
  const row = {
    client_id: clientId,
    sold_by: user.id,
    expires_at: subscriptionExpiry().toISOString(),
    paid_at: paid ? new Date().toISOString() : null,
    payment_method_id: paymentMethodId,
  };
  let { error: subError } = await supabase.from("subscriptions").insert(row);
  // Миграцию 0025 ещё не накатили — колонки payment_method_id нет. Продажу
  // из-за этого не роняем: пишем абонемент без способа оплаты (его потом
  // проставит админ), иначе деплой до миграции убил бы весь поток продаж.
  if (subError?.code === "PGRST204") {
    const legacy: Partial<typeof row> = { ...row };
    delete legacy.payment_method_id;
    ({ error: subError } = await supabase.from("subscriptions").insert(legacy));
  }
  if (subError) return { error: `Не удалось создать абонемент: ${subError.message}` };

  // Заявка доведена до продажи → закрываем её и привязываем клиента. Способ
  // оплаты уезжает в заявку: админ видит его прямо в ленте, а не выбирает
  // заново руками.
  if (bookingId) {
    await supabase
      .from("bookings")
      .update({
        status: "done",
        client_id: clientId,
        payment_method_id: paymentMethodId,
      })
      .eq("id", bookingId);
  }

  // Клуб пока не запускаем: продажа абонемента НЕ делает клиента членом клуба.
  // Членство добавляется вручную на вкладке «Члены клуба» (вернём авто-выдачу,
  // когда клуб оформим целиком).

  revalidatePath("/", "layout"); // см. комментарий в recordClientAction

  const params = new URLSearchParams({ type: "subscription", name });
  if (paid) params.set("paid", "1");
  if (clientResult.existingName) params.set("existing", clientResult.existingName);
  redirect(`/instructor/done?${params.toString()}`);
}

// ── Списание минут с абонемента ───────────────────────────────────────────────
export async function writeOffAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireStaff();
  const supabase = await createClient();

  const clientId = String(formData.get("clientId") ?? "");
  const clientName = String(formData.get("clientName") ?? "");
  const minutes = Math.floor(Number(formData.get("minutes")));

  if (!clientId || !Number.isFinite(minutes) || minutes <= 0) {
    return { error: "Укажите, сколько минут списать." };
  }

  // Последний активный абонемент клиента.
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id, total_minutes, expires_at, status")
    .eq("client_id", clientId)
    .eq("status", "active")
    .order("sold_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!sub) return { error: "У клиента нет активного абонемента." };

  if (sub.expires_at && new Date(sub.expires_at) < new Date()) {
    await supabase.from("subscriptions").update({ status: "expired" }).eq("id", sub.id);
    return { error: "Абонемент истёк (минуты живут 3 месяца). Продайте новый." };
  }

  // Остаток = всего + ручные корректировки админа − все списания (в т.ч.
  // другими инструкторами — RLS такие сессии и корректировки видеть разрешает).
  const left = await minutesLeft(supabase, sub);

  if (minutes > left) {
    return {
      error: `Остаток ${left} мин — списать ${minutes} нельзя. Превышение оформите отдельной сессией по прайсу проката.`,
    };
  }

  const { error: sessionError } = await supabase.from("sessions").insert({
    client_id: clientId,
    subscription_id: sub.id,
    minutes_used: minutes,
    amount: 0, // списание с абонемента — чека нет, комиссия не начисляется
    instructor_id: user.id,
    created_by: user.id,
    date: vnToday(),
  });
  if (sessionError) return { error: `Не удалось списать: ${sessionError.message}` };

  if (left - minutes === 0) {
    await supabase.from("subscriptions").update({ status: "used_up" }).eq("id", sub.id);
  }

  revalidatePath("/", "layout"); // см. комментарий в recordClientAction

  const params = new URLSearchParams({
    type: "writeoff",
    name: clientName,
    minutes: String(minutes),
    left: String(left - minutes),
  });
  redirect(`/instructor/done?${params.toString()}`);
}

// ── Настройки профиля ────────────────────────────────────────────────────────

export async function updateProfileAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireFieldStaff();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Имя не может быть пустым." };

  const ageRaw = String(formData.get("age") ?? "").trim();
  const age = ageRaw ? Number(ageRaw) : null;
  if (age !== null && (!Number.isInteger(age) || age < 14 || age > 99)) {
    return { error: "Возраст — целое число от 14 до 99." };
  }

  // Цель вводят как «20 000 000» или «20.000.000» — выкидываем разделители.
  const goalRaw = String(formData.get("monthly_goal") ?? "").replace(/[\s.,]/g, "");
  if (goalRaw && !/^\d+$/.test(goalRaw)) {
    return { error: "Цель по ЗП — число в донгах, например 20 000 000." };
  }
  const monthlyGoal = goalRaw ? Number(goalRaw) : null;

  const patch: Record<string, unknown> = {
    name,
    age,
    monthly_goal: monthlyGoal,
  };

  // На users нет политики «обновить свою строку» (и на бакет avatars нет
  // политик записи) — профиль сознательно меняется только через сервер.
  // Пишем под service_role, но строго в строку залогиненного пользователя.
  const admin = createAdminClient();

  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    const checked = checkPhoto(photo);
    if (checked.error) return { error: checked.error };
    const ext = checked.ext;

    // Путь стабильный (одна аватарка на пользователя, upsert перезаписывает
    // старую), а ?v= в сохранённом URL сбрасывает кеш браузера и next/image.
    const path = `${user.id}.${ext}`;
    const { error: uploadError } = await admin.storage
      .from("avatars")
      .upload(path, photo, { upsert: true, contentType: photo.type });
    if (uploadError) {
      return { error: `Не удалось загрузить фото: ${uploadError.message}` };
    }

    const { data: pub } = admin.storage.from("avatars").getPublicUrl(path);
    patch.photo_url = `${pub.publicUrl}?v=${Date.now()}`;
  }

  const { error: updateError } = await admin
    .from("users")
    .update(patch)
    .eq("id", user.id);
  if (updateError) return { error: `Не удалось сохранить: ${updateError.message}` };

  // Имя и фото видны на главном экране кабинета и в бейдже шапки.
  revalidatePath("/", "layout");
  redirect(ROLE_HOME[user.role]);
}

// ── Личная реф-ссылка инструктора (пак C) ─────────────────────────────────────
// Код 6 символов без похожих знаков (0/O, 1/l) — диктуют вслух. Крошечный
// генератор дублирует админский (createAgentAction) намеренно, чтобы не тянуть
// серверную зависимость между кабинетами.
const REF_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
function randomRefCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += REF_ALPHABET[Math.floor(Math.random() * REF_ALPHABET.length)];
  }
  return code;
}

// Создать личный код инструктору, если его ещё нет. Пишем под service_role
// (у users нет политики «обновить свою строку»), строго в свою строку и только
// когда ref_code пуст (`.is("ref_code", null)` — защита от гонки и повторов).
export async function createMyRefCodeAction() {
  const user = await requireStaff();
  if (user.role !== "instructor") return;

  // `.is("ref_code", null)` — и защита от гонки, и от повторного клика: если код
  // уже есть, update просто не найдёт строку и ничего не перезапишет.
  const admin = createAdminClient();
  for (let attempt = 0; attempt < 5; attempt++) {
    const { error } = await admin
      .from("users")
      .update({ ref_code: randomRefCode() })
      .eq("id", user.id)
      .is("ref_code", null);
    if (!error) break;
    if (error.code !== "23505") break; // не unique-конфликт — повтор не поможет
  }
  revalidatePath("/instructor/record");
}

// Допуск клиента к выездам (экскурсия/сафари) — пак G. Инструктор решает, что
// клиент уже уверенно катает, и ставит флаг; жёсткого блока в записи нет.
// Пишем под service_role: у инструктора нет update-политики на clients, а этот
// экшен строго меняет одно поле после проверки роли — чужие данные не трогает.
export async function setTourApprovedAction(formData: FormData) {
  await requireStaff();
  const clientId = String(formData.get("clientId") ?? "");
  if (!clientId) return;

  const admin = createAdminClient();
  const { error } = await admin
    .from("clients")
    .update({ tour_approved: formData.get("approved") === "1" })
    .eq("id", clientId);
  if (error) console.error("[instructor] tour approval error:", error.message);
  revalidatePath("/instructor/stats");
}

// ── Свои сессии и клиенты (пачка №9, пак 1) ──────────────────────────────────
// Инструктор оформляет записи весь день и до сих пор не мог проверить, что
// именно записалось: список сессий был только у админа. Теперь список свой
// (/instructor/sessions), и правится прямо в нём — без «позвони админу».
//
// Пишем под service_role: у инструктора нет update-политики на sessions, и
// открывать её значило бы дать право менять ЛЮБУЮ сессию (RLS-условия на
// update проверяются и по новой строке — чужой instructor_id туда протащить
// можно). Вместо этого сначала читаем сессию и убеждаемся, что она его.
function failIfError(error: { message: string } | null, what: string): void {
  if (!error) return;
  console.error(`[instructor] ${what}:`, error.message);
  throw new Error(`${what}: ${error.message}`);
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function updateMySessionAction(formData: FormData) {
  const user = await requireStaff();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const admin = createAdminClient();
  const { data: session } = await admin
    .from("sessions")
    .select("id, instructor_id, subscription_id")
    .eq("id", id)
    .maybeSingle();
  if (!session) throw new Error("сессия не найдена");
  // Админ ходит в кабинет как суперюзер (см. requireRole) — ему любую.
  if (user.role !== "admin" && session.instructor_id !== user.id) {
    throw new Error("это не ваша сессия");
  }

  const patch: Record<string, unknown> = {};
  const date = String(formData.get("date") ?? "").trim();
  if (DAY_RE.test(date)) patch.date = date;
  // Примечание правится и у списания: «списал 20 мин, доска барахлила» — тот
  // же полезный контекст. Пустое поле стирает текст, а не «не трогаем».
  if (formData.has("note")) {
    patch.note = String(formData.get("note") ?? "").trim() || null;
  }

  // Списание минут с абонемента — тоже сессия, но без чека: сумму, услугу и
  // способ оплаты у неё править нечем, а минуты правит админ корректировкой.
  if (!session.subscription_id) {
    const amount = parseVnd(formData.get("amount"));
    if (amount !== null) patch.amount = amount;

    const serviceId = String(formData.get("serviceId") ?? "");
    if (serviceId) {
      // Сессию нельзя переделать в абонемент: у него своя форма с минутами.
      const { data: svc } = await admin
        .from("services")
        .select("category")
        .eq("id", serviceId)
        .maybeSingle();
      if (svc && svc.category !== "subscription") patch.service_id = serviceId;
    }

    // Способ оплаты, в отличие от остальных полей, разрешаем и СТИРАТЬ: пустое
    // значение — это осознанный выбор «— не указан —», а не «не трогаем».
    if (formData.has("paymentMethodId")) {
      patch.payment_method_id =
        String(formData.get("paymentMethodId") ?? "") || null;
    }
  }

  if (Object.keys(patch).length === 0) return;
  const { error } = await admin.from("sessions").update(patch).eq("id", id);
  failIfError(error, "не удалось сохранить сессию");
  revalidatePath("/", "layout");
}

// Карточка клиента из кабинета инструктора: те же поля, что у админа. Клиентов
// заводит сам инструктор (в записи и списании), опечатку в телефоне или имени
// чинить ему же. Пишем под service_role — update-политики на clients у него нет.
export async function updateClientFromInstructorAction(formData: FormData) {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return;

  // Телефон обязателен и проверяется на сервере — как в админской карточке
  // (пачка №9, пак 4, п.2): по номеру клиента находят в записи и списании.
  const phoneRaw = String(formData.get("phone") ?? "").trim();
  if (!isValidPhone(phoneRaw)) throw new Error(PHONE_ERROR);

  // Ник в телеге: пусто — очистить, валидный — сохранить, кривой — отказать.
  // Молча превращать опечатку в null нельзя (та же логика, что в админке).
  const tgRaw = String(formData.get("telegramUsername") ?? "").trim();
  const telegram = tgRaw ? normalizeTelegram(tgRaw) : null;
  if (tgRaw && !telegram) {
    throw new Error("ник в Telegram: 5–32 символа — буквы, цифры, подчёркивание");
  }

  const ageNum = Math.floor(Number(formData.get("age")));
  const admin = createAdminClient();
  const { error } = await admin
    .from("clients")
    .update({
      name,
      phone: phoneDigits(phoneRaw) || phoneRaw,
      age: Number.isFinite(ageNum) && ageNum > 0 ? ageNum : null,
      city: String(formData.get("city") ?? "").trim() || null,
      internal_note: String(formData.get("note") ?? "").trim() || null,
      tour_approved: formData.get("tour_approved") === "1",
      telegram_username: telegram,
    })
    .eq("id", id);
  failIfError(error, "не удалось сохранить карточку клиента");
  revalidatePath("/", "layout");
}

// Фото клиента с телефона инструктора — он и стоит рядом с человеком. Отдельный
// экшен от карточки: та сохраняется без файлов (см. uploadClientPhotoAction).
export async function uploadClientPhotoFromInstructorAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireStaff();

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Клиент не найден." };

  const photo = formData.get("photo");
  if (!(photo instanceof File) || photo.size === 0) {
    return { error: "Выберите фото." };
  }
  const checked = checkPhoto(photo);
  if (checked.error) return { error: checked.error };

  const admin = createAdminClient();
  // Путь стабильный (одно фото на клиента, upsert перезаписывает старое),
  // а ?v= в сохранённом URL сбрасывает кеш браузера и next/image.
  const path = `${id}.${checked.ext}`;
  const { error: uploadError } = await admin.storage
    .from("clients")
    .upload(path, photo, { upsert: true, contentType: photo.type });
  if (uploadError) {
    return { error: `Не удалось загрузить фото: ${uploadError.message}` };
  }

  const { data: pub } = admin.storage.from("clients").getPublicUrl(path);
  const { error } = await admin
    .from("clients")
    .update({ photo_url: `${pub.publicUrl}?v=${Date.now()}` })
    .eq("id", id);
  if (error) return { error: `Не удалось сохранить фото: ${error.message}` };

  revalidatePath("/", "layout");
  return { error: null };
}

// ── Расходы инструктора (пачка №4, пак A, пункт 3) ───────────────────────────
// Инструктор тратит свои деньги по работе (топливо, мелкий ремонт) и вносит
// это сам. created_by берётся из сессии — RLS (expenses_instructor_*_own в
// 0016) пускает его только к собственным строкам, чужие суммы он не увидит.
// В «Дополнительные расходы» админки они падают наравне с админскими: для
// P&L школы неважно, чьей рукой внесена трата.
export async function addInstructorExpenseAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireFieldStaff();

  const amount = parseVnd(formData.get("amount"));
  if (!amount || amount <= 0) return { error: "Сумма — число в донгах." };

  const dateRaw = String(formData.get("date") ?? "").trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : vnToday();

  const supabase = await createClient();
  const { error } = await supabase.from("expenses").insert({
    date,
    amount,
    category_id: String(formData.get("categoryId") ?? "").trim() || null,
    comment: String(formData.get("comment") ?? "").trim() || null,
    created_by: user.id,
  });
  if (error) return { error: `Не удалось добавить расход: ${error.message}` };

  revalidatePath("/", "layout");
  return { error: null };
}

// Удалить можно только свой расход: .eq("created_by", user.id) — не столько
// защита (её держит RLS), сколько честный ноль строк вместо тихого успеха,
// если id прилетел чужой.
export async function deleteInstructorExpenseAction(formData: FormData) {
  const user = await requireFieldStaff();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("expenses")
    .delete()
    .eq("id", id)
    .eq("created_by", user.id);
  if (error) {
    console.error("[instructor] expense delete error:", error.message);
    throw new Error(`не удалось удалить расход: ${error.message}`);
  }
  revalidatePath("/", "layout");
}

// ── Подсказка «этот клиент уже у нас» (пачка №4, пак B, пункт 10) ────────────
// Форма записи дёргает это по мере набора телефона. Смысл: инструктор должен
// узнать про повторного клиента ДО того, как оформит запись, — обучение ему
// второй раз не нужно, а если у него живой абонемент, то и платить он сегодня
// не должен. Раньше дубль по телефону разруливался молча уже после отправки:
// сессия ложилась на старую карточку, но инструктор об этом не узнавал и успевал
// провести (и взять деньги за) лишнее обучение.
//
// Возвращаем только то, что нужно показать. Ни заметок, ни сумм: подсказка
// висит на экране в чужом присутствии.
export interface ClientHint {
  found: boolean;
  name?: string;
  trainingDone?: boolean; // уже проходил обучение — повторное не нужно
  minutesLeft?: number; // остаток по активному абонементу
  tourApproved?: boolean; // допущен к выездам
  sessionsCount?: number;
}

export async function lookupClientByPhoneAction(phone: string): Promise<ClientHint> {
  await requireStaff();
  if (!isValidPhone(phone)) return { found: false };

  const supabase = await createClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, phone, tour_approved")
    .not("phone", "is", null)
    .limit(1000);

  const match = (clients ?? []).find((c) => phonesMatch(c.phone, phone));
  if (!match) return { found: false };

  // Обучение считаем пройденным по факту сессии категории training, а не по
  // отдельному флажку: флажок пришлось бы кому-то ставить руками, а сессия
  // и так есть — её нельзя забыть.
  //
  // Сессии читаем service-role клиентом: RLS отдаёт инструктору только его
  // собственные, и постоянный клиент напарника показывался бы как новый
  // («обучения не было», «занятий: 0») — ровно то, от чего эта подсказка
  // должна спасать. Наружу уходят только флаги и счётчик, без сумм и услуг.
  const [sessionsRes, subsRes] = await Promise.all([
    createAdminClient()
      .from("sessions")
      .select("id, services(category)")
      .eq("client_id", match.id),
    supabase
      .from("subscriptions")
      .select("id, total_minutes, status, expires_at")
      .eq("client_id", match.id)
      .eq("status", "active"),
  ]);

  const sessions = sessionsRes.data ?? [];
  const trainingDone = sessions.some(
    (s) =>
      (s.services as unknown as { category: string } | null)?.category ===
      "training",
  );

  // Остаток минут — по тем же правилам, что и на списании: считаем только
  // непросроченные абонементы.
  const now = new Date();
  let minutes = 0;
  for (const sub of subsRes.data ?? []) {
    const expires = sub.expires_at ? new Date(sub.expires_at as string) : null;
    if (expires && expires < now) continue;
    minutes += await minutesLeft(supabase, {
      id: sub.id as string,
      total_minutes: sub.total_minutes as number,
    });
  }

  return {
    found: true,
    name: match.name as string,
    trainingDone,
    minutesLeft: minutes,
    tourApproved: Boolean(match.tour_approved),
    sessionsCount: sessions.length,
  };
}

// ── Смена: открытие, закрытие, фотофиксация (пачка №4, пак C, пункт 5) ────────
// Договорённость с начальником: инструктор утром снимает доску и крыло, вечером
// снова — по паре снимков видно, что за день изменилось (где случилась
// поломка). Штрафов нет, задача — видимость для босса (см. shiftRules.ts).
//
// Фото грузим ПО ОДНОМУ (каждый снимок — свой запрос), а не пачкой: лимит тела
// server action 5 МБ (next.config.ts), а доска + крыло + связь + дефекты в
// одном POST его пробьют. Первый снимок дня заводит смену на лету.
//
// Разделение клиентов (по ревью безопасности, миграция 0020):
//  • сама СМЕНА (opened_at/closed_at/planned) пишется ТОЛЬКО под service_role.
//    RLS не ограничивает набор колонок, поэтому политика «правь свою строку»
//    позволяла инструктору выставить opened_at на 08:00 или planned=true
//    запросом к PostgREST мимо UI. Метку времени теперь ставит сервер, а роль
//    и владельца проверяет код — подделать нельзя;
//  • ФОТО (shift_photos) инструктор пишет под собой — RLS shift_photos_*_own
//    даёт привязать снимок только к своей смене, подделывать там нечего;
//  • файл в Storage кладёт service_role: у бакета shifts нет политик записи
//    (как у avatars и clients).

const PHOTO_PHASES = ["open", "close"] as const;
const PHOTO_KINDS = ["board", "wing", "comms", "extra"] as const;
type PhotoPhase = (typeof PHOTO_PHASES)[number];
type PhotoKind = (typeof PHOTO_KINDS)[number];

// Смена инструктора на сегодня; заводим на лету, если её нет. Незапланированный
// выход помечаем planned=false — босс отличит его от согласованной смены.
// Пишем service_role-клиентом (см. блок выше): прямую запись в shifts у
// инструктора отобрали в 0020, а владельца — instructor_id = свой id — задаёт
// сам код, из формы это поле не приходит.
async function ensureTodayShift(
  user: AppUser,
): Promise<{ id: string; openedAt: string | null; closedAt: string | null } | { error: string }> {
  const admin = createAdminClient();
  const date = vnToday();
  const { data: existing } = await admin
    .from("shifts")
    .select("id, opened_at, closed_at")
    .eq("instructor_id", user.id)
    .eq("date", date)
    .maybeSingle();
  if (existing) {
    return {
      id: existing.id as string,
      openedAt: (existing.opened_at as string | null) ?? null,
      closedAt: (existing.closed_at as string | null) ?? null,
    };
  }

  const { data: created, error } = await admin
    .from("shifts")
    .insert({ instructor_id: user.id, date, planned: false, created_by: user.id })
    .select("id, opened_at, closed_at")
    .single();
  if (error || !created) {
    // 23505 = смену только что завёл параллельный запрос (двойной тап) —
    // перечитываем существующую, это не ошибка.
    if (error?.code === "23505") {
      const { data: again } = await admin
        .from("shifts")
        .select("id, opened_at, closed_at")
        .eq("instructor_id", user.id)
        .eq("date", date)
        .maybeSingle();
      if (again) {
        return {
          id: again.id as string,
          openedAt: (again.opened_at as string | null) ?? null,
          closedAt: (again.closed_at as string | null) ?? null,
        };
      }
    }
    return { error: `Не удалось открыть смену: ${error?.message ?? "?"}` };
  }
  return { id: created.id as string, openedAt: null, closedAt: null };
}

// Добавить один снимок к смене. board/wing привязываются к единице инвентаря
// (без неё по фото не понять, какая доска), comms/extra — свободные.
export async function addShiftPhotoAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireFieldStaff();
  if (user.role === "admin") {
    return { error: "Смены открывают инструкторы и механик." };
  }

  const phase = String(formData.get("phase") ?? "") as PhotoPhase;
  const kind = String(formData.get("kind") ?? "") as PhotoKind;
  if (!PHOTO_PHASES.includes(phase) || !PHOTO_KINDS.includes(kind)) {
    return { error: "Неизвестный тип снимка." };
  }

  const equipmentId = String(formData.get("equipmentId") ?? "").trim() || null;
  if ((kind === "board" || kind === "wing") && !equipmentId) {
    return { error: "Выберите, какую доску или крыло снимаете." };
  }

  const photo = formData.get("photo");
  if (!(photo instanceof File) || photo.size === 0) {
    return { error: "Сделайте снимок." };
  }
  const checked = checkPhoto(photo);
  if (checked.error) return { error: checked.error };

  const supabase = await createClient();
  const shift = await ensureTodayShift(user);
  if ("error" in shift) return { error: shift.error };

  // Фазу нельзя доснимать после того, как она завершена: открытие — пока смена
  // не открыта, закрытие — пока не закрыта (и только когда уже открыта).
  if (phase === "open" && shift.openedAt) {
    return { error: "Смена уже открыта — досъёмка утренних фото закрыта." };
  }
  if (phase === "close") {
    if (!shift.openedAt) return { error: "Сначала откройте смену." };
    if (shift.closedAt) return { error: "Смена уже закрыта." };
  }

  // Путь содержит id смены и uuid — снаружи не угадать; бакет публичный, как
  // avatars/clients. Файл кладём service_role: на бакете shifts политик нет.
  const path = `${shift.id}/${phase}-${kind}-${crypto.randomUUID()}.${checked.ext}`;
  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from("shifts")
    .upload(path, photo, { contentType: photo.type });
  if (uploadError) {
    return { error: `Не удалось загрузить фото: ${uploadError.message}` };
  }
  const { data: pub } = admin.storage.from("shifts").getPublicUrl(path);

  // Строку пишем под пользователем — RLS shift_photos_insert_own проверит, что
  // смена его. created_by = user.id обязателен политикой.
  const { error: rowError } = await supabase.from("shift_photos").insert({
    shift_id: shift.id,
    phase,
    kind,
    equipment_id: equipmentId,
    path,
    url: pub.publicUrl,
    created_by: user.id,
  });
  if (rowError) {
    // Файл уже в бакете — подчистим, чтобы не копить сирот (их и так снесёт
    // чистилка через 3 дня, но лучше сразу).
    await admin.storage.from("shifts").remove([path]);
    return { error: `Не удалось сохранить снимок: ${rowError.message}` };
  }

  revalidatePath(`${cabinetBase(user)}/shift`);
  return { error: null };
}

// Убрать неудачный кадр (смазал — переснял). Только пока фаза не завершена.
export async function deleteShiftPhotoAction(formData: FormData) {
  const user = await requireFieldStaff();
  if (user.role === "admin") return;

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  // Читаем снимок вместе со статусом смены: RLS-select пускает инструктора к
  // фото своих смен, поэтому чужой id вернёт пусто.
  const { data: photo } = await supabase
    .from("shift_photos")
    .select("id, path, phase, shifts(opened_at, closed_at)")
    .eq("id", id)
    .maybeSingle();
  if (!photo) return;

  const shift = photo.shifts as unknown as {
    opened_at: string | null;
    closed_at: string | null;
  } | null;
  // Завершённую фазу не трогаем: утренние фото после открытия и вечерние после
  // закрытия — уже зафиксированный факт.
  if (photo.phase === "open" && shift?.opened_at) return;
  if (photo.phase === "close" && shift?.closed_at) return;

  const { error } = await supabase.from("shift_photos").delete().eq("id", id);
  if (error) {
    console.error("[instructor] shift photo delete error:", error.message);
    return;
  }
  // Файл из бакета — service_role (политик записи на shifts нет).
  const admin = createAdminClient();
  await admin.storage.from("shifts").remove([photo.path as string]);

  revalidatePath(`${cabinetBase(user)}/shift`);
}

// Открытие смены обязательно требует пары «доска + крыло»: без них фотофиксация
// бессмысленна (не с чем сравнить вечерние снимки). Комментарий необязателен —
// это объяснение, почему открыл позже 9:00.
async function requireBoardAndWing(
  supabase: Awaited<ReturnType<typeof createClient>>,
  shiftId: string,
  phase: PhotoPhase,
): Promise<string | null> {
  const { data } = await supabase
    .from("shift_photos")
    .select("kind")
    .eq("shift_id", shiftId)
    .eq("phase", phase);
  const kinds = new Set((data ?? []).map((p) => p.kind as string));
  if (!kinds.has("board")) return "Сфотографируйте доску.";
  if (!kinds.has("wing")) return "Сфотографируйте крыло.";
  return null;
}

export async function openShiftAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireFieldStaff();
  if (user.role === "admin") {
    return { error: "Смены открывают инструкторы и механик." };
  }

  const supabase = await createClient();
  const shift = await ensureTodayShift(user);
  if ("error" in shift) return { error: shift.error };
  if (shift.openedAt) return { error: "Смена уже открыта." };

  const missing = await requireBoardAndWing(supabase, shift.id, "open");
  if (missing) return { error: missing };

  // opened_at ставит СЕРВЕР (не клиент) и пишет service_role — подделать
  // «вовремя» нельзя (0020).
  const comment = String(formData.get("comment") ?? "").trim() || null;
  const admin = createAdminClient();
  const { error } = await admin
    .from("shifts")
    .update({ opened_at: new Date().toISOString(), open_comment: comment })
    .eq("id", shift.id)
    .eq("instructor_id", user.id);
  if (error) return { error: `Не удалось открыть смену: ${error.message}` };

  revalidatePath(`${cabinetBase(user)}/shift`);
  return { error: null };
}

export async function closeShiftAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireFieldStaff();
  if (user.role === "admin") {
    return { error: "Смены закрывают инструкторы и механик." };
  }

  const supabase = await createClient();
  const date = vnToday();
  const { data: shift } = await supabase
    .from("shifts")
    .select("id, opened_at, closed_at")
    .eq("instructor_id", user.id)
    .eq("date", date)
    .maybeSingle();
  if (!shift) return { error: "Смена не открыта." };
  if (!shift.opened_at) return { error: "Сначала откройте смену." };
  if (shift.closed_at) return { error: "Смена уже закрыта." };

  const missing = await requireBoardAndWing(supabase, shift.id as string, "close");
  if (missing) return { error: missing };

  // closed_at ставит СЕРВЕР под service_role — та же защита, что и на открытии.
  const comment = String(formData.get("comment") ?? "").trim() || null;
  const admin = createAdminClient();
  const { error } = await admin
    .from("shifts")
    .update({ closed_at: new Date().toISOString(), close_comment: comment })
    .eq("id", shift.id)
    .eq("instructor_id", user.id);
  if (error) return { error: `Не удалось закрыть смену: ${error.message}` };

  revalidatePath(`${cabinetBase(user)}/shift`);
  return { error: null };
}
