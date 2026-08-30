"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAppUser,
  isAdminLike,
  ROLE_HOME,
  type AppRole,
  type AppUser,
} from "@/lib/auth";
import {
  phoneDigits,
  phonesMatch,
  isValidPhone,
  normalizeTelegram,
  PHONE_ERROR,
} from "@/lib/phone";
import { vnToday, subscriptionExpiry } from "@/lib/dates";
import { checkRecordDate } from "@/lib/recordDate";
import { isPaymentClaim } from "@/lib/paymentClaim";
import { minutesLeft } from "@/lib/subscriptions";
import { parseRiders, writeOffNote } from "@/lib/riders";
import { parseVnd } from "@/lib/money";
import { checkPhoto } from "@/lib/photos";
import {
  agentCommissionFor,
  agentRewardApplies,
  applyRefDiscount,
  asAgentPlan,
  DEFAULT_AGENT_PLAN,
  type AgentPlan,
} from "@/lib/agentReward";
import { loadAllClients } from "@/lib/clients";
import { pickChannel } from "@/lib/channels";
import {
  claimBooking,
  linkBookingResult,
  releaseBooking,
  type BookingClaimState,
} from "@/lib/bookingClaim";

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
  if (!user || !(user.role === "instructor" || isAdminLike(user.role))) {
    redirect("/login?next=/instructor");
  }
  return user;
}

// Часть экранов кабинета один в один переиспользуют механик и СММщик: свои
// расходы, настройки профиля и смена с фотофиксацией — её с 21.08.2026
// открывает любой сотрудник.
// Отдельная проверка (а не «пустить их в requireStaff») намеренно: денежные
// действия — запись клиента, продажа абонемента, списание минут, правка
// сессии — остаются за инструктором, и RLS это подтверждает второй раз.
//
// ⚠️ Хозяев админки проверяем через isAdminLike, а НЕ строкой 'admin' в списке.
// Пока здесь был литерал, роль dev (0044) в него не попадала, и любое фоновое
// действие уносило David'а с экрана: подсказка по телефону в «Записать
// клиента» дёргает lookupClientByPhoneAction, тот делал redirect на /login,
// а залогиненного логин тут же отправлял в его кабинет. Снаружи — «вставил
// номер, и страница сама перезагрузилась, потеряв заполненное». Ровно тот же
// баг ловили 14.08.2026 на СММщике: список ролей перечисляют в одном месте,
// а забывают в другом.
const FIELD_ROLES: AppRole[] = ["instructor", "mechanic", "smm"];

async function requireFieldStaff(): Promise<AppUser> {
  const user = await getAppUser();
  if (!user || !(isAdminLike(user.role) || FIELD_ROLES.includes(user.role))) {
    redirect("/login?next=/instructor");
  }
  return user;
}

// Тот же экран лежит по нескольким адресам (/instructor/…, /mechanic/…,
// /smm/…) — revalidatePath должен указывать на кабинет того, кто нажал кнопку,
// иначе человек увидит старые данные.
function cabinetBase(user: AppUser): string {
  if (user.role === "mechanic") return "/mechanic";
  if (user.role === "smm") return "/smm";
  return "/instructor";
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
  const { rows: existing, error: selError } = await loadAllClients<{
    id: string;
    name: string | null;
    phone: string | null;
    telegram_username: string | null;
    city: string | null;
  }>(supabase, "id, name, phone, telegram_username, city", { onlyWithPhone: true });
  if (selError) return { error: `Не удалось найти клиента: ${selError}` };

  // Телефон уже есть в базе → это тот же человек, вторую карточку не заводим.
  // Введённое имя при этом НЕ перезаписывает старое — сообщаем вызвавшему,
  // на кого реально легла запись (иначе кажется, что клиент «потерялся»).
  const match = (existing ?? []).find((c) => phonesMatch(c.phone, input.phone));
  if (match) {
    // Ник в телеге дописываем, только если его ещё нет: у постоянного клиента
    // в карточке может стоять выверенный контакт, и затирать его случайной
    // опечаткой из сегодняшней формы нельзя.
    //
    // Пишем service_role-клиентом (0031). Update-политики на clients у
    // инструктора нет и не было: этот дописанный ник МОЛЧА не сохранялся —
    // RLS отбрасывал update без единой ошибки (0 строк = успех). Заодно это
    // позволило снять clients_insert_instructor: набор колонок задаёт код.
    // Город — та же история: у постоянного клиента он уже выверен, но если
    // поле пустое, а в форме город указали (теперь он обязателен), дописываем.
    const patch: Record<string, string> = {};
    if (input.telegram && !match.telegram_username) {
      patch.telegram_username = input.telegram;
    }
    if (input.city && !match.city) patch.city = input.city;
    if (Object.keys(patch).length > 0) {
      await createAdminClient().from("clients").update(patch).eq("id", match.id);
    }
    return { id: match.id, existingName: match.name ?? undefined };
  }

  const { data: created, error: insError } = await createAdminClient()
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
//
// Пишем service_role-клиентом (миграция 0030). Политика bookings_update_staff
// разрешала инструктору update ЛЮБОЙ колонки ЛЮБОЙ заявки — RLS не умеет
// ограничивать набор колонок, поэтому запросом мимо интерфейса можно было
// переписать телефон, способ оплаты или статус чужой заявки. Что именно
// меняется, решает теперь этот код; условия .eq/.is остались на месте и
// по-прежнему держат гонку.
export async function acceptBookingAction(formData: FormData) {
  const user = await requireStaff();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await createAdminClient()
    .from("bookings")
    .update({ accepted_by: user.id, accepted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "confirmed")
    .is("accepted_by", null);

  // Перерисовать счётчики (кнопка «Записи», бейдж в шапке) везде.
  revalidatePath("/", "layout");
}

// «Отказаться»: вернуть запись в общий пул (только свою — .eq("accepted_by")).
export async function declineBookingAction(formData: FormData) {
  const user = await requireStaff();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await createAdminClient()
    .from("bookings")
    .update({ accepted_by: null, accepted_at: null })
    .eq("id", id)
    .eq("accepted_by", user.id);

  revalidatePath("/", "layout");
}

// «Клиент учтён в другом занятии» (0038): вторая заявка парного занятия.
//
// Мама записывает себя и дочку двумя заявками, а катаются они по одному
// парному обучению за 3,5 млн — сессия одна. Раньше вторую заявку инструктор
// закрыть не мог вообще: у него есть только «Записать клиента», а записать
// второй раз — это второй чек в выручке и вторые 15%. Заявка висела в ленте,
// пока админ не отменял её руками, и человек, который реально катался,
// оставался в CRM отказом. Теперь она закрывается ссылкой на то же занятие.
//
// Деньги не меняются: выручка живёт на сессии, а сессия остаётся одна.
export async function coverBookingAction(formData: FormData) {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!id || !sessionId) return;

  // Через service_role, как и остальные записи инструктора (0030): решает, что
  // именно меняется, этот код, а не RLS.
  const admin = createAdminClient();

  // Занятие берём из базы, а не со слов формы: id в разметке подменяется.
  const { data: session } = await admin
    .from("sessions")
    .select("id, client_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return;

  // Закрыть так можно только живую подтверждённую заявку. Условие на статус
  // заодно держит гонку: заявку, которую в этот момент оформляют через
  // «Записать клиента», перехватить уже не выйдет.
  const { error } = await admin
    .from("bookings")
    .update({
      status: "done",
      pinned: false,
      session_id: session.id,
      client_id: session.client_id,
    })
    .eq("id", id)
    .eq("status", "confirmed");
  // Тихо «закрывать» заявку без связи нельзя: получится ровно та дыра, ради
  // которой всё и затевалось.
  if (error) {
    console.error("[instructor] cover booking error:", error.message);
    return;
  }

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
  // Дату занятия инструктор выбирает сам, но только в пределах недели в обе
  // стороны (пачка №10, п.2): «забыл оформить вчерашнего» и «клиент заплатил
  // сегодня, катается завтра» он закрывает сам, а промахнуться мимо месяца —
  // увезти занятие в чужую ЗП и чужую статистику — не может. Дальше по времени
  // по-прежнему оформляет админ. min/max в форме — подсказка, правило здесь.
  const checkedDate = checkRecordDate(String(formData.get("date") ?? ""));
  if ("error" in checkedDate) return { error: checkedDate.error };
  const date = checkedDate.date;
  const bookingId = String(formData.get("bookingId") ?? "") || null;
  // Формат оплаты обязателен (пак A, пункт 6). Проверяем и на сервере, а не
  // только через required в разметке: required обходится, а дыра в отчёте
  // «чем платят» потом не восстанавливается.
  const paymentMethodId = String(formData.get("paymentMethodId") ?? "").trim();

  if (!name || !phone || !serviceId) {
    return { error: "Заполните имя, телефон и услугу." };
  }
  // Город и канал записи обязательны (пачка №20): required в разметке —
  // подсказка, правило здесь. Без них не видно, откуда к нам едут люди.
  if (!city) {
    return { error: "Укажите город клиента." };
  }
  const channel = pickChannel(formData.get("channel"), formData.get("channelOther"));
  if (!channel) {
    return { error: "Укажите канал записи." };
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
  // Прежнее состояние заявки — чтобы вернуть его, если после захвата занятие
  // не запишется (см. lib/bookingClaim).
  let bookingBefore: BookingClaimState | null = null;
  if (bookingId) {
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, status, client_id, payment_method_id, ref_code, services(category)")
      .eq("id", bookingId)
      .maybeSingle();
    if (!booking) return { error: "Заявка не найдена." };
    // Уже оформленную заявку вторично не проводим: повторный сабмит (кнопка
    // «Назад», зависшая вкладка) записывал второе занятие и вторую награду
    // агенту — чек задваивался в выручке и в ЗП. Это ранняя проверка «по-
    // хорошему»: настоящая защита от двух устройств сразу — захват ниже.
    if (booking.status === "done") {
      return { error: "Эта заявка уже оформлена — занятие записано." };
    }
    bookingBefore = {
      status: booking.status as string,
      client_id: (booking.client_id as string | null) ?? null,
      payment_method_id: (booking.payment_method_id as string | null) ?? null,
    };
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
  // commission_fixed из карточки агента больше не читаем: с 16.08.2026 размер
  // награды зависит от услуги (lib/agentTerms). А с 17.08.2026 — ещё и от
  // тарифа агента (agents.terms_plan, 0046): у одного партнёра свои условия.
  let agent: { id: string; plan: AgentPlan } | null = null;
  if (refCode) {
    const { data } = await supabase
      .from("agents")
      .select("id, terms_plan")
      .eq("ref_code", refCode)
      .eq("active", true)
      .maybeSingle();
    agent = data
      ? { id: data.id as string, plan: asAgentPlan(data.terms_plan) }
      : null;
  }
  // Тариф нужен и там, где агента нет: функции условий требуют его всегда, а
  // без агента они всё равно возвращают ноль.
  const plan = agent?.plan ?? DEFAULT_AGENT_PLAN;

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
    plan,
  });

  const price = Number(service.price ?? 0);
  const amount = applyRefDiscount(price, service.code as string | null, rewarded, plan);
  // Сколько школа платит агенту за такую запись: на стандартном тарифе
  // 200 000 ₫ за базовое и 300 000 ₫ за парное, на процентном — доля от чека
  // (lib/agentTerms). Поэтому считаем ПОСЛЕ суммы: 20% берутся с того, что
  // гость реально заплатил, то есть уже со снятой скидкой.
  const commission = rewarded
    ? agentCommissionFor(service.code as string | null, amount, plan)
    : 0;
  const discounted = rewarded;
  const discount = price - amount; // сколько сняли — проговорим на экране «Готово»

  // Заявку занимаем ДО записи занятия: пометка «выполнена» ставится одним
  // запросом с условием «если ещё не выполнена», поэтому из двух одновременных
  // оформлений (админ и инструктор с разных устройств) проходит ровно одно.
  // См. lib/bookingClaim — там же почему прежней проверки статуса мало.
  if (bookingId && bookingBefore) {
    const claim = await claimBooking(createAdminClient(), bookingId, {
      client_id: clientId,
      payment_method_id: paymentMethodId,
    });
    if (claim.error) return { error: `Не удалось записать: ${claim.error}` };
    if (!claim.claimed) {
      return { error: "Эта заявка уже оформлена — занятие записано." };
    }
  }

  // Комиссию агента фиксируем на сессии: с неё начинается вся остальная
  // арифметика занятия — 35% Marina, 15% инструкторам и 2% CRM считаются с чека
  // МИНУС эта комиссия. См. миграцию 0021 и lib/finance.
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .insert({
      client_id: clientId,
      service_id: service.id,
      instructor_id: user.id,
      date,
      amount,
      agent_commission: commission,
      payment_method_id: paymentMethodId,
      // Как человек записался на это занятие (0034): заявки у записи с пляжа
      // нет, и канал терялся бы совсем.
      channel,
      note: String(formData.get("note") ?? "").trim() || null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (sessionError) {
    // Занятие не записалось — заявка не должна остаться «выполненной».
    if (bookingId && bookingBefore) {
      await releaseBooking(createAdminClient(), bookingId, bookingBefore);
    }
    return { error: `Не удалось записать: ${sessionError.message}` };
  }

  // Заявка теперь знает своё занятие (0038): в ленте админа видно «Занятие:
  // услуга, дата, сумма», а закрытые «в никуда» заявки не теряются.
  if (bookingId && session) {
    await linkBookingResult(createAdminClient(), bookingId, { session_id: session.id as string });
  }

  // Награда агенту — за первое базовое обучение приведённого клиента. Занятие
  // проведено и оплачено прямо сейчас — это и есть подтверждение, поэтому
  // пишем сразу `confirmed` (иначе награда зависала бы pending, клиент везде
  // «оплатил», а в расчёте месяца агенту 0). Размер зависит от услуги
  // (lib/agentTerms) и от чека не зависит.
  //
  // Пишем service_role-клиентом (0030): политика rewards_insert_instructor
  // проверяла только роль, поэтому инструктор мог выписать любому агенту
  // награду любого размера запросом мимо интерфейса. Размер берём из таблицы
  // условий по коду услуги, а не из формы.
  if (rewarded) {
    const { error: rewardError } = await createAdminClient()
      .from("referral_rewards")
      .insert({
        referrer_type: "agent",
        referrer_id: agent!.id,
        client_id: clientId,
        reward_type: "money",
        amount: commission,
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
      });
    if (rewardError) {
      // Сессия уже записана — не роняем оформление, но проговариваем проблему.
      console.error("[instructor] reward insert error:", rewardError.message);
    }
  }

  // Заявка уже закрыта захватом выше — там же ей проставлены клиент и способ
  // оплаты, которым он расплатился (админу видно прямо в ленте заявок).

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
  // Не флаг, а сумма: скидка теперь разная у базового и парного занятия, и
  // «со скидкой» без числа инструктору ничего не говорит.
  if (discounted && discount > 0) params.set("discount", String(discount));
  // Записали не сегодняшним числом — проговариваем это на экране «Готово»:
  // промах в дате иначе всплывёт только в конце месяца, в чужой ЗП.
  if (date !== vnToday()) params.set("date", date);
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
  // «Кто взял деньги» (пачка №10, п.5). Оплату отмечаем ТОЛЬКО когда их принял
  // сам инструктор: paid_at идёт в выручку месяца и в котёл 15%, и ставить его
  // со слов клиента нельзя. «Принял админ» и «непонятно» вместо этого оставляют
  // заявление — админ его подтвердит кнопкой «Отметить оплату» (см. 0032).
  // Старое поле paid поддерживаем на случай вкладки, открытой до этой правки.
  const paymentChoice = String(formData.get("payment") ?? "").trim();
  const claim = isPaymentClaim(paymentChoice) ? paymentChoice : null;
  const paid = paymentChoice ? paymentChoice === "me" : formData.get("paid") === "on";
  // Пришли из заявки на абонемент — закроем её после продажи (пачка №5, п.11).
  const bookingId = String(formData.get("bookingId") ?? "") || null;
  // Чем заплатили. Обязателен ровно тогда, когда деньги получены: продажа
  // «оплатит позже» способа оплаты ещё не имеет. Проверяем на сервере — в
  // разметке required обходится, а дыру в отчёте потом не залатать.
  const paymentMethodId =
    String(formData.get("paymentMethodId") ?? "").trim() || null;

  if (!name || !phone) return { error: "Заполните имя и телефон." };
  if (paid && !paymentMethodId) return { error: "Укажите формат оплаты." };

  // Дата продажи (пачка №25, п.3). Раньше абонемент всегда писался «сейчас», и
  // вчерашняя продажа уезжала не в тот день — а от даты оплаты зависят выручка
  // месяца и котёл 15%. Коридор тот же, что у занятий: ±7 дней (lib/recordDate),
  // дальше — через админа. Пустое поле = сегодня (старая вкладка).
  const checkedSold = checkRecordDate(String(formData.get("date") ?? ""));
  if ("error" in checkedSold) return { error: checkedSold.error };
  const soldAt = new Date(`${checkedSold.date}T00:00:00Z`).toISOString();

  // Уже оформленную заявку вторично не проводим — та же защита, что в
  // recordClientAction, только там её поставили, а здесь забыли. Повторный
  // сабмит (кнопка «Назад», зависшая вкладка со старым ?booking=id) создавал
  // ВТОРОЙ абонемент на 6 млн: он задваивался и в выручке, и в котле 15%,
  // а у клиента появлялись лишние 300 минут.
  // Настоящая защита от двух устройств сразу — захват заявки ниже.
  let bookingBefore: BookingClaimState | null = null;
  if (bookingId) {
    const { data: booking } = await supabase
      .from("bookings")
      .select("status, client_id, payment_method_id")
      .eq("id", bookingId)
      .maybeSingle();
    if (!booking) return { error: "Заявка не найдена." };
    if (booking.status === "done") {
      return { error: "Эта заявка уже оформлена — абонемент продан." };
    }
    bookingBefore = {
      status: booking.status as string,
      client_id: (booking.client_id as string | null) ?? null,
      payment_method_id: (booking.payment_method_id as string | null) ?? null,
    };
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
  //
  // Тоже service_role (0030). Политика subscriptions_insert_instructor
  // проверяла только «sold_by — это я», а цену, минуты и отметку оплаты в
  // новой строке не ограничивала: запросом мимо интерфейса инструктор мог
  // завести себе оплаченный абонемент на любую сумму — и накачать этим общий
  // котёл 15%. Здесь цену и минуты по-прежнему ставит база (default'ы),
  // sold_by берётся из сессии, а не из формы.
  const admin = createAdminClient();

  // Заявку занимаем ДО создания абонемента — одним запросом с условием «если
  // ещё не выполнена» (см. lib/bookingClaim). Иначе два одновременных
  // оформления заводят клиенту два абонемента по 6 млн: задвоенная выручка,
  // задвоенный котёл 15% и лишние 300 минут.
  if (bookingId && bookingBefore) {
    const claim = await claimBooking(admin, bookingId, {
      client_id: clientId,
      payment_method_id: paymentMethodId,
    });
    if (claim.error) return { error: `Не удалось создать абонемент: ${claim.error}` };
    if (!claim.claimed) {
      return { error: "Эта заявка уже оформлена — абонемент продан." };
    }
  }

  const row = {
    client_id: clientId,
    sold_by: user.id,
    sold_at: soldAt,
    // Минуты живут 3 месяца ОТ ДАТЫ ПРОДАЖИ — в том числе вчерашней.
    expires_at: subscriptionExpiry(new Date(soldAt)).toISOString(),
    // Инструктор отмечает оплату, только когда деньги принял сам, — значит
    // платили в день продажи. Отдельного поля «дата оплаты» ему не даём: оно
    // нужно для случая «купил в июле, заплатил в августе», а такие разбирает
    // админ (см. форму в /admin/subscriptions).
    paid_at: paid ? soldAt : null,
    payment_method_id: paymentMethodId,
    // Кто именно оставил заявление — видно админу: спрашивать «а кто это
    // написал» через неделю бессмысленно.
    payment_claim: claim,
    payment_claim_note: claim
      ? String(formData.get("paymentClaimNote") ?? "").trim() || null
      : null,
    payment_claim_by: claim ? user.id : null,
    payment_claim_at: claim ? new Date().toISOString() : null,
  };
  // Способ оплаты (0025) и заявление об оплате (0032) в боевой базе есть.
  // Повтор вставки без них убран 16.08.2026: он терял и способ оплаты, и само
  // заявление «оплату принял админ» — то есть ровно то, ради чего инструктор
  // заполнял форму, и молча.
  const { data: sub, error: subError } = await admin
    .from("subscriptions")
    .insert(row)
    .select("id")
    .single();
  if (subError) {
    // Абонемент не создался — заявка не должна остаться «выполненной».
    if (bookingId && bookingBefore) await releaseBooking(admin, bookingId, bookingBefore);
    return { error: `Не удалось создать абонемент: ${subError.message}` };
  }

  // Заявка уже закрыта захватом выше — там же ей проставлены клиент и способ
  // оплаты, чтобы админ видел его прямо в ленте, а не выбирал заново руками.
  // Заявку на абонемент закрывает продажа, а не занятие (0038): без этой ссылки
  // она выглядела бы «выполненной, но без занятия».
  if (bookingId && sub) {
    await linkBookingResult(admin, bookingId, { subscription_id: sub.id as string });
  }

  // Клуб пока не запускаем: продажа абонемента НЕ делает клиента членом клуба.
  // Членство добавляется вручную на вкладке «Члены клуба» (вернём авто-выдачу,
  // когда клуб оформим целиком).

  revalidatePath("/", "layout"); // см. комментарий в recordClientAction

  const params = new URLSearchParams({ type: "subscription", name });
  if (paid) params.set("paid", "1");
  if (claim) params.set("claim", claim);
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
  const duration = Math.floor(Number(formData.get("minutes")));
  // Сколько человек каталось одновременно с ОДНОГО абонемента: двое по 30
  // минут — это 60 минут с абонемента (правило начальника от 30.08.2026).
  const riders = parseRiders(formData.get("riders"));
  // Пометка к прокату — необязательная, уходит в примечание сессии (то же
  // поле, что заполняет админ в своей форме списания).
  const comment = String(formData.get("comment") ?? "").trim();

  if (!clientId || !Number.isFinite(duration) || duration <= 0) {
    return { error: "Укажите, сколько минут списать." };
  }
  const minutes = duration * riders;

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

  // Статус абонемента правим service_role-клиентом (0030). Политика
  // subscriptions_update_instructor разрешала инструктору update ЛЮБОЙ колонки
  // ЛЮБОГО абонемента: запросом мимо интерфейса можно было проставить себе
  // sold_by, отметить оплату (paid_at идёт в выручку и в комиссию продавца),
  // накинуть total_minutes или переписать цену. Приложению от этой политики
  // нужны ровно два статуса — их и оставляем, всё остальное закрыто.
  if (sub.expires_at && new Date(sub.expires_at) < new Date()) {
    await createAdminClient()
      .from("subscriptions")
      .update({ status: "expired" })
      .eq("id", sub.id);
    return { error: "Абонемент истёк (минуты живут 3 месяца). Продайте новый." };
  }

  // Остаток = всего + ручные корректировки админа − все списания (в т.ч.
  // другими инструкторами — RLS такие сессии и корректировки видеть разрешает).
  const left = await minutesLeft(supabase, sub);

  if (minutes > left) {
    // При парном катании называем и раскладку: «списать 60» после введённых
    // 30 выглядит опечаткой, пока не видно, что минуты умножились на райдеров.
    const asked = riders > 1 ? `${minutes} (${duration} × ${riders})` : `${minutes}`;
    return {
      error: `Остаток ${left} мин — списать ${asked} нельзя. Превышение оформите отдельной сессией по прайсу проката.`,
    };
  }

  const { data: written, error: sessionError } = await supabase
    .from("sessions")
    .insert({
      client_id: clientId,
      subscription_id: sub.id,
      minutes_used: minutes,
      amount: 0, // списание с абонемента — чека нет, комиссия не начисляется
      instructor_id: user.id,
      created_by: user.id,
      note: writeOffNote(riders, comment),
      date: vnToday(),
    })
    .select("id")
    .single();
  if (sessionError) return { error: `Не удалось списать: ${sessionError.message}` };

  // Проверка «хватает ли минут» выше сделана ДО записи, и между ними успевает
  // влезть второй инструктор: оба видят остаток 60, оба списывают по 40 — и на
  // абонементе минус 20. Поэтому пересчитываем остаток уже ПОСЛЕ записи и, если
  // ушли в минус, убираем собственную строку. Удаляем именно свою (по id), а не
  // «последнюю»: чужое списание — не наше дело.
  //
  // Удаляем service_role-клиентом: у инструктора политики delete на sessions
  // нет вовсе (0005 даёт ему только insert и select), поэтому его же клиент
  // снёс бы ноль строк молча — без ошибки, но и без отката.
  const leftAfter = await minutesLeft(supabase, sub);
  if (leftAfter < 0) {
    const { error: rollbackError } = await createAdminClient()
      .from("sessions")
      .delete()
      .eq("id", written.id);
    if (rollbackError) {
      console.error("[instructor] writeoff rollback error:", rollbackError.message);
    }
    return {
      error:
        "Пока вы заполняли форму, минуты списал кто-то ещё — остаток изменился. Откройте списание заново.",
    };
  }

  if (leftAfter === 0) {
    await createAdminClient()
      .from("subscriptions")
      .update({ status: "used_up" })
      .eq("id", sub.id);
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
  // Админ (и разработчик — те же права) ходит в кабинет как суперюзер
  // (см. requireRole) — ему любую.
  if (!isAdminLike(user.role) && session.instructor_id !== user.id) {
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

// Проверка ролей здесь шире, чем «инструктор с админом»: ту же форму записи
// открывает СММщик (/smm/record, экран общий с админкой), и на requireStaff он
// получал редирект на /login прямо посреди набора номера — а оттуда его,
// залогиненного, тут же выбрасывало в свою ленту заявок. Со стороны это
// выглядело так: дописал последние цифры телефона — страница перезагрузилась
// и потеряла заполненное. Записывать клиента ему можно (createSessionAction
// пускает офис), список клиентов он и так видит — незачем закрывать подсказку.
export async function lookupClientByPhoneAction(phone: string): Promise<ClientHint> {
  await requireFieldStaff();
  if (!isValidPhone(phone)) return { found: false };

  const supabase = await createClient();
  const { rows: clients } = await loadAllClients<{
    id: string;
    name: string;
    phone: string | null;
    tour_approved: boolean | null;
  }>(supabase, "id, name, phone, tour_approved", { onlyWithPhone: true });

  const match = clients.find((c) => phonesMatch(c.phone, phone));
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
// Правила переписаны 27.07.2026 по живому опыту пляжа:
//
//   • ОБЯЗАТЕЛЬНЫЙ кадр ровно один на фазу. Утром — фото на пляже, «я на
//     работе»; вечером — фото у бара на выходе с территории, «я как раз ухожу».
//     Требуется от каждого, кто на смене: и от старшего, и от второго, и от
//     механика;
//   • оборудование (доска, крыло, связь, дефект) снимают ТОЛЬКО при
//     открытии и только по надобности — кому удобно, тот и снял. Вечером
//     оборудование не снимают вообще: сравнивать пары кадров оказалось некому,
//     а лишние пять минут на выходе люди просто не делали;
//   • само фото и есть действие: обязательный кадр открывает и закрывает смену.
//     Разделение «сначала фото, потом кнопка» стоило Никите выхода 27.07 — фото
//     он сделал, кнопку не нажал, и премия за смену не начислилась.
//
// Штрафов по-прежнему нет, задача — видимость для босса (см. shiftRules.ts).
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
const PHOTO_KINDS = ["board", "wing", "comms", "extra", "checkin"] as const;
type PhotoPhase = (typeof PHOTO_PHASES)[number];
type PhotoKind = (typeof PHOTO_KINDS)[number];

// Ответ загрузчика фото: кроме ошибки — что произошло со сменой. Клиенту это
// нужно, чтобы сказать «Смена открыта», а не сухое «Фото загружено».
export interface ShiftPhotoState {
  error: string | null;
  opened?: boolean;
  closed?: boolean;
}

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
// (без неё по фото не понять, какая доска), comms/extra/checkin — свободные.
//
// Кадр 'checkin' — он же САМО ДЕЙСТВИЕ: утреннее фото на пляже открывает смену,
// вечернее у бара — закрывает (см. markShift ниже). Раньше это были два разных
// шага, фото и кнопка, и человек делал фото, уходил с экрана — а выход ему не
// засчитывался, потому что кнопку он не нажал. Именно так 27.07 потерял смену
// Никита.
export async function addShiftPhotoAction(
  _prev: ShiftPhotoState,
  formData: FormData,
): Promise<ShiftPhotoState> {
  const user = await requireFieldStaff();
  if (isAdminLike(user.role)) {
    // Смену открывает любой сотрудник (21.08.2026), кроме босса: его выход
    // школа не оплачивает, и «смена админа» только путала бы расчёт дня.
    return { error: "Смену открывает сотрудник, а не начальник." };
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

  // Что и когда можно снимать:
  //  • закрытая смена — день зафиксирован, больше ничего не принимаем;
  //  • отметку 'checkin' каждой фазы делают ОДИН раз: это сам факт выхода
  //    и ухода, второй такой кадр ничего не значит;
  //  • необязательные кадры (доска, крыло, связь, дефект) можно доснимать в
  //    любой момент дня. Раньше утренние фото после открытия не принимались —
  //    теперь оборудование снимает тот, кому удобно, и часто это происходит
  //    уже после того, как человек отметился на пляже.
  if (shift.closedAt) return { error: "Смена уже закрыта." };
  if (phase === "close" && !shift.openedAt) {
    return { error: "Сначала откройте смену — фото на пляже." };
  }
  if (kind === "checkin" && phase === "open" && shift.openedAt) {
    return { error: "Смена уже открыта." };
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

  // Отметка на пляже открывает смену, отметка у бара — закрывает. Время ставит
  // СЕРВЕР под service_role (0020): у инструктора прав на shifts нет, подделать
  // «пришёл вовремя» нельзя.
  let opened = false;
  let closed = false;
  if (kind === "checkin") {
    const column = phase === "open" ? "opened_at" : "closed_at";
    const { error: markError } = await admin
      .from("shifts")
      .update({ [column]: new Date().toISOString() })
      .eq("id", shift.id)
      .eq("instructor_id", user.id);
    if (markError) {
      // Фото уже засчитано — терять его из-за неудачной отметки незачем:
      // человек переснимет, и попытка повторится. Но сказать об этом надо.
      return {
        error: `Фото сохранено, но смену отметить не удалось: ${markError.message}`,
      };
    }
    opened = phase === "open";
    closed = phase === "close";
  }

  revalidatePath(`${cabinetBase(user)}/shift`);
  return { error: null, opened, closed };
}

// Убрать неудачный кадр (смазал — переснял). Только пока фаза не завершена.
export async function deleteShiftPhotoAction(formData: FormData) {
  const user = await requireFieldStaff();
  if (isAdminLike(user.role)) return;

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  // Читаем снимок вместе со статусом смены: RLS-select пускает инструктора к
  // фото своих смен, поэтому чужой id вернёт пусто.
  const { data: photo } = await supabase
    .from("shift_photos")
    .select("id, path, phase, kind, shifts(opened_at, closed_at)")
    .eq("id", id)
    .maybeSingle();
  if (!photo) return;

  const shift = photo.shifts as unknown as {
    opened_at: string | null;
    closed_at: string | null;
  } | null;
  // Отметку о приходе и об уходе не удаляем: это не иллюстрация, а сам факт
  // выхода — снеся кадр, инструктор стёр бы обоснование своей смены.
  if (photo.kind === "checkin") return;
  // После закрытия день зафиксирован целиком.
  if (shift?.closed_at) return;

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

// Комментарий к своей смене: «почему открыл позже 9:00», «что случилось на
// закрытии». Раньше он приезжал вместе с нажатием «Открыть смену» — а кнопок
// больше нет, смену открывает фото. Поэтому комментарий стал отдельным
// действием: его можно написать и потом, пока смена не закрыта.
//
// Пишем service_role (0020: прямой записи в shifts у инструктора нет), но
// трогаем ровно одну колонку и только у СВОЕЙ сегодняшней смены — времена
// открытия и закрытия отсюда недоступны.
export async function saveShiftCommentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireFieldStaff();
  if (isAdminLike(user.role)) {
    return { error: "Смену ведёт сотрудник, а не начальник." };
  }

  const phase = String(formData.get("phase") ?? "") as PhotoPhase;
  if (!PHOTO_PHASES.includes(phase)) return { error: "Неизвестный этап смены." };

  const comment = String(formData.get("comment") ?? "").trim() || null;
  const admin = createAdminClient();
  const { data: shift } = await admin
    .from("shifts")
    .select("id")
    .eq("instructor_id", user.id)
    .eq("date", vnToday())
    .maybeSingle();
  if (!shift) return { error: "Смена ещё не начата." };

  const column = phase === "open" ? "open_comment" : "close_comment";
  const { error } = await admin
    .from("shifts")
    .update({ [column]: comment })
    .eq("id", shift.id)
    .eq("instructor_id", user.id);
  if (error) return { error: `Не удалось сохранить: ${error.message}` };

  revalidatePath(`${cabinetBase(user)}/shift`);
  return { error: null };
}
