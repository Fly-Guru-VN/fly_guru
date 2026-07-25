"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppUser } from "@/lib/auth";
import {
  phoneDigits,
  phonesMatch,
  isValidPhone,
  normalizeTelegram,
  PHONE_ERROR,
} from "@/lib/phone";
import { subscriptionExpiry, vnToday } from "@/lib/dates";
import { minutesLeft } from "@/lib/subscriptions";
import { sendInstructorsBookingAlert } from "@/lib/telegram";
import { MANUAL_CHANNELS } from "@/lib/channels";
import { DICT_LABEL, type DictTable } from "@/lib/dictionaries";
import type { EquipmentKind } from "@/lib/equipment";
import { parseVnd } from "@/lib/money";
import { checkPhoto } from "@/lib/photos";
import { agentRewardApplies, applyRefDiscount } from "@/lib/agentReward";
import { loadAllClients } from "@/lib/clients";
import type { ActionState } from "../instructor/actions";

// Server actions админки: полный цикл заявки. Админ созванивается с гостем,
// вносит время/возраст/вес и подтверждает — заявка становится «записью»,
// которую видят инструкторы. RLS-политика bookings_admin_all даёт полный доступ.

async function requireAdmin() {
  const user = await getAppUser();
  if (!user || user.role !== "admin") redirect("/login?next=/admin");
  return user;
}

// Два действия админки делает и механик — он такой же человек на пляже:
// заводит заявку на подошедшего гостя и снимает премию за выход, если смену
// отработали не по-людски (оборудование после этого чинит он). Обе проверки
// живут в коде, а не в RLS: премию пишем service_role-клиентом (см. 0020 —
// политика не умеет ограничивать набор колонок).
async function requireAdminOrMechanic() {
  const user = await getAppUser();
  if (!user || (user.role !== "admin" && user.role !== "mechanic")) {
    redirect("/login?next=/admin");
  }
  return user;
}

// Числовое поле формы → integer или null (пустое/мусор не пишем в базу).
function intOrNull(value: FormDataEntryValue | null): number | null {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Общие поля карточки заявки из формы.
function bookingFields(formData: FormData) {
  return {
    scheduled_time: String(formData.get("scheduledTime") ?? "").trim() || null,
    age: intOrNull(formData.get("age")),
    weight: intOrNull(formData.get("weight")),
    internal_note: String(formData.get("note") ?? "").trim() || null,
    // Как договорились платить. Проставляется руками здесь и автоматически,
    // когда заявку доводят до занятия или абонемента (там способ оплаты
    // обязателен) — чтобы в ленте заявок было видно, чем реально заплатили.
    payment_method_id:
      String(formData.get("paymentMethodId") ?? "").trim() || null,
  };
}

// Провалившаяся запись не должна выглядеть как успешная. Кидаем ошибку — её
// поймает admin/error.tsx и честно скажет «не сохранилось»; настоящая причина
// уходит в серверный лог. Раньше сбой видел только лог: страница
// перерисовывалась прежней, и человек продолжал заполнять CRM, думая, что всё
// записалось. Формы, которые умеют показывать текст ошибки под кнопкой
// (useActionState), сюда не ходят — они возвращают { error } как и раньше.
function failIfError(error: { message: string } | null, what: string): void {
  if (!error) return;
  console.error(`[admin] ${what}:`, error.message);
  throw new Error(`${what}: ${error.message}`);
}

// Обновить заявку и перерисовать всё, где висят счётчики (админка, кабинет,
// бейдж в шапке) — на масштабе школы дешевле, чем целиться в пути.
async function updateBooking(id: string, patch: Record<string, unknown>) {
  const supabase = await createClient();
  const { error } = await supabase.from("bookings").update(patch).eq("id", id);
  failIfError(error, "не удалось сохранить заявку");
  revalidatePath("/", "layout");
}

// Сообщение в группу инструкторов: «появилась новая запись, кто примет?»
// Телефон клиента в группу не шлём — только номер, услуга и время.
async function notifyInstructors(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("bookings")
    .select("booking_no, scheduled_time, preferred_date, services(name)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return;
  const service = data.services as unknown as { name: string } | null;
  await sendInstructorsBookingAlert({
    bookingNo: data.booking_no,
    serviceName: service?.name ?? null,
    scheduledTime: data.scheduled_time,
    preferredDate: data.preferred_date,
  });
}

// Ручная заявка: клиент позвонил / написал / пришёл ногами. Без неё такой
// клиент не попадал в CRM вообще — заявки умела создавать только форма сайта,
// а значит календарь и «Записи» инструктора не видели половину потока.
// По умолчанию сразу «Подтверждена»: админ уже договорился о дате голосом,
// второй шаг «Подтвердить» тут лишний. Тогда же уходит уведомление в телегу.
export async function createBookingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const author = await requireAdminOrMechanic();

  const clientName = String(formData.get("clientName") ?? "").trim();
  if (!clientName) return { error: "Укажите имя клиента." };
  const phone = String(formData.get("phone") ?? "").trim();
  if (!phone) return { error: "Укажите телефон клиента." };

  const channel = String(formData.get("channel") ?? "").trim();
  if (!MANUAL_CHANNELS[channel]) return { error: "Выберите, откуда пришёл клиент." };

  const preferredDate = String(formData.get("preferredDate") ?? "").trim();
  if (preferredDate && !DAY_RE.test(preferredDate))
    return { error: "Дата — в формате ГГГГ-ММ-ДД." };

  const serviceId = String(formData.get("serviceId") ?? "");
  const confirmed = formData.get("status") !== "new";

  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("bookings")
    .insert({
      client_name: clientName,
      phone,
      service_id: serviceId || null,
      preferred_date: preferredDate || null,
      status: confirmed ? "confirmed" : "new",
      src: channel,
      // Формат оплаты сюда приходит из bookingFields: в заявке он
      // необязателен — клиент ещё не платил (пак A).
      ...bookingFields(formData),
    })
    .select("id")
    .single();
  if (error) return { error: `Не удалось создать заявку: ${error.message}` };

  // Инструкторам сообщаем только о том, что уже подтверждено — как и с сайта.
  if (confirmed) await notifyInstructors(created.id as string).catch(() => {});

  revalidatePath("/", "layout");
  // У механика ленты заявок нет — возвращаем его на ту же форму с плашкой
  // «заявка ушла инструкторам», чтобы он мог записать следующего.
  redirect(author.role === "mechanic" ? "/mechanic/record?created=1" : "/admin/bookings");
}

// «Подтвердить»: сохранить данные созвона и опубликовать запись инструкторам.
export async function confirmBookingAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await updateBooking(id, { ...bookingFields(formData), status: "confirmed" });
  await notifyInstructors(id).catch(() => {});
}

// Смена статуса из карточки: в обработке / подтверждена / выполнена / отменена /
// в архив. Побочные эффекты завязаны на статус, а не на кнопку, чтобы работать
// одинаково из любого места ленты.
// Статус приходит первым аргументом через .bind() на кнопке: React НЕ кладёт
// name/value кнопки в FormData при formAction-функции — через name="status"
// сюда приходила пустота, и все кнопки статусов молча не работали.
export async function setStatusAction(status: string, formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const allowed = ["contacted", "confirmed", "done", "cancelled", "archived"];
  if (!id || !allowed.includes(status)) return;

  // Здесь жил вызов confirmPendingReward — он переводил награду агента из
  // «ожидает» в «подтверждена». Награды давно пишутся сразу `confirmed` (в
  // момент, когда занятие записано и оплачено), статус pending не создаёт
  // никто, и функция была мёртвой. В базе строк pending нет.
  const patch: Record<string, unknown> = { status };
  // Закрытые заявки не должны висеть закреплёнными сверху.
  if (status === "done" || status === "cancelled" || status === "archived") {
    patch.pinned = false;
  }
  await updateBooking(id, patch);
  if (status === "confirmed") await notifyInstructors(id).catch(() => {});
}

// ── Сессии (подэтап 4.2) ─────────────────────────────────────────────────────
// Сумма и дата в форме — как их вводит человек: «1 500 000», «1.500.000».
// Разбор живёт в lib/money (его же зовёт кабинет инструктора, пак A).

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// Дата 'YYYY-MM-DD' из формы → момент timestamptz. Берём полночь UTC = 7 утра
// в Нячанге: дата остаётся «своим» днём и в UTC, и по местному времени.
function dayToIso(day: string): string {
  return new Date(`${day}T00:00:00Z`).toISOString();
}

// Клиент из формы: существующий (select clientId) ИЛИ новый по имени+телефону.
// Перед созданием ищем по телефону — та же логика гибкого сравнения цифр,
// что у инструктора, чтобы не плодить дублей из-за «+84» против «84».
//
// createdAt — момент, которым клиент появился у школы: дата занятия (или
// продажи абонемента), а НЕ «сейчас». При записи задним числом (перенос старой
// CRM, забытое занятие) клиент иначе считался бы новым в текущем месяце, и
// «Новых клиентов» на Статистике показывало бы всех перенесённых разом.
// В обычной работе дата занятия и есть сегодня — поведение не меняется.
async function resolveClient(
  supabase: Awaited<ReturnType<typeof createClient>>,
  adminId: string,
  formData: FormData,
  createdAt: string,
): Promise<{ id: string } | { error: string }> {
  const clientId = String(formData.get("clientId") ?? "");
  if (clientId) return { id: clientId };

  const name = String(formData.get("newName") ?? "").trim();
  const phone = String(formData.get("newPhone") ?? "").trim();
  if (!name || !phone) {
    return { error: "Выберите клиента из списка или заполните имя и телефон нового." };
  }
  if (!isValidPhone(phone)) return { error: PHONE_ERROR };

  const telegram = normalizeTelegram(formData.get("telegramUsername") as string);

  const { rows: existing } = await loadAllClients<{
    id: string;
    phone: string | null;
    telegram_username: string | null;
  }>(supabase, "id, phone, telegram_username", { onlyWithPhone: true });
  const match = existing.find((c) => phonesMatch(c.phone, phone));
  if (match) {
    // Ник дописываем только в пустое поле — см. findOrCreateClient.
    if (telegram && !match.telegram_username) {
      await supabase
        .from("clients")
        .update({ telegram_username: telegram })
        .eq("id", match.id);
    }
    return { id: match.id };
  }

  const { data: created, error } = await supabase
    .from("clients")
    .insert({
      name,
      phone: phoneDigits(phone) || phone,
      city: String(formData.get("newCity") ?? "").trim() || null,
      telegram_username: telegram,
      source: "offline",
      created_by: adminId,
      created_at: createdAt,
    })
    .select("id")
    .single();
  if (error || !created) {
    return { error: `Не удалось создать клиента: ${error?.message ?? "?"}` };
  }
  return { id: created.id };
}

// Скидка по агентской ссылке и условия награды агента — общие с кабинетом
// инструктора, живут в lib/agentReward.

// Создать сессию задним числом: инструктор забыл оформить занятие — админ
// вносит его вручную на любую дату. Тем же экшеном пользуется админская
// «Запись клиента» (может закрыть заявку и учесть реф-скидку/награду — см.
// bookingId ниже). Чек фиксируется в момент создания (изменение прайса в
// будущем прошлые сессии не трогает).
export async function createSessionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const date = String(formData.get("date") ?? "").trim();
  if (!DAY_RE.test(date)) return { error: "Укажите дату сессии." };

  const serviceId = String(formData.get("serviceId") ?? "");
  const instructorId = String(formData.get("instructorId") ?? "");
  if (!serviceId || !instructorId) {
    return { error: "Выберите услугу и инструктора." };
  }

  // Если запись закрывает заявку (админская «Запись клиента» из ?booking=id) —
  // тянем её реф-код и, если это активный агент, готовим скидку и награду, как
  // в кабинете инструктора. Форма сессий bookingId не шлёт — для неё блок no-op.
  //
  // Проверяем ДО создания клиента: иначе отказ ниже оставил бы клиента-сироту.
  const bookingId = String(formData.get("bookingId") ?? "") || null;
  let agent: { id: string; commission_fixed: number } | null = null;
  if (bookingId) {
    const { data: booking } = await supabase
      .from("bookings")
      .select("status, ref_code, services(category)")
      .eq("id", bookingId)
      .maybeSingle();
    if (!booking) return { error: "Заявка не найдена." };
    // Уже проведённую заявку вторично не оформляем: кнопка «Назад», повторный
    // сабмит или забытая вкладка со старым ?booking=id записывали ВТОРОЕ
    // занятие и ВТОРУЮ награду агенту — чек задваивался в выручке и ЗП.
    if (booking.status === "done") {
      return {
        error: "Эта заявка уже проведена — занятие записано. Смотрите вкладку «Сессии».",
      };
    }
    // Заявку на абонемент нельзя провести сессией: список услуг здесь без
    // абонемента, поэтому она молча падала бы на базовое обучение, а абонемент
    // не создавался. Отправляем на форму продажи (пачка №5, п.11).
    if ((booking.services as unknown as { category?: string } | null)?.category === "subscription") {
      return {
        error: "Это заявка на абонемент — оформите её кнопкой «Продать абонемент» во вкладке «Абонементы».",
      };
    }
    if (booking.ref_code) {
      const { data } = await supabase
        .from("agents")
        .select("id, commission_fixed")
        .eq("ref_code", booking.ref_code)
        .eq("active", true)
        .maybeSingle();
      agent = data ?? null;
    }
  }

  const { data: service } = await supabase
    .from("services")
    .select("price, category, code")
    .eq("id", serviceId)
    .maybeSingle();
  if (!service) return { error: "Услуга не найдена." };
  // Абонемент сессией не оформить: без своей формы клиент не получит минуты,
  // членство и отметку оплаты. Дубль-защита к фильтру списка на странице.
  if (service.category === "subscription") {
    return { error: "Абонемент оформляется на вкладке «Абонементы»." };
  }

  // Клиент — последним из проверок: всё, что могло отказать, уже отказало.
  // created_at = дате занятия (см. resolveClient).
  const clientRes = await resolveClient(supabase, admin.id, formData, dayToIso(date));
  if ("error" in clientRes) return clientRes;
  const clientId = clientRes.id;

  // Заработал ли агент на этом занятии: только первое базовое обучение
  // клиента (в т.ч. парное) — то же правило, что в кабинете инструктора.
  const rewarded = await agentRewardApplies(supabase, {
    hasAgent: Boolean(agent),
    serviceCode: service.code as string | null,
    clientId,
  });

  // Пустая сумма = по прайсу (со скидкой −10%, если она положена); введённая
  // вручную — важнее (админ решает: скидки, брони, доплаты).
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const amount: number | null = amountRaw
    ? parseVnd(amountRaw)
    : applyRefDiscount(Number(service.price ?? 0), rewarded);
  if (amount === null) return { error: "Сумма — число в донгах, например 1 500 000." };

  // Формат оплаты (пак A, пункт 6). У админа обязателен так же, как у
  // инструктора: сессия задним числом — тоже состоявшаяся оплата.
  const paymentMethodId = String(formData.get("paymentMethodId") ?? "").trim();
  if (!paymentMethodId) return { error: "Укажите формат оплаты." };

  // Комиссию агента фиксируем на сессии — из неё вычтется база инструктора
  // (15% с чека минус комиссия). Ставим её там же, где положена награда, даже
  // если сумму админ ввёл руками: агент привёл клиента независимо от чека.
  const { error: insError } = await supabase.from("sessions").insert({
    client_id: clientId,
    service_id: serviceId,
    instructor_id: instructorId,
    date,
    amount,
    agent_commission: rewarded ? agent!.commission_fixed : 0,
    payment_method_id: paymentMethodId,
    note: String(formData.get("note") ?? "").trim() || null,
    created_by: admin.id,
  });
  if (insError) return { error: `Не удалось создать сессию: ${insError.message}` };

  // Награда агенту (за первое базовое обучение клиента) и закрытие заявки:
  // запись доведена до оплаченного занятия. Оплата состоялась (сессия
  // записана), поэтому награду пишем сразу `confirmed` датой сессии — она
  // попадёт в расчёт того же месяца, что и выручка. Раньше висела pending, и
  // в payroll агент оставался с 0.
  if (rewarded) {
    const { error: rewardError } = await supabase.from("referral_rewards").insert({
      referrer_type: "agent",
      referrer_id: agent!.id,
      client_id: clientId,
      reward_type: "money",
      amount: agent!.commission_fixed,
      status: "confirmed",
      confirmed_at: dayToIso(date),
    });
    // Не кидаем: сессия уже записана. Ошибка «не сохранилось» толкнула бы
    // админа оформить занятие второй раз — получили бы дубль чека в выручке.
    // Награду в крайнем случае восстановит админ, дубль денег — нет.
    if (rewardError) console.error("[admin] reward insert error:", rewardError.message);
  }
  if (bookingId) {
    // Способ оплаты возвращаем в заявку: в ленте заявок сразу видно, чем
    // клиент расплатился, без похода в сессии.
    await supabase
      .from("bookings")
      .update({
        status: "done",
        client_id: clientId,
        payment_method_id: paymentMethodId,
      })
      .eq("id", bookingId);
  }

  // Сессия влияет на выручку, статистику и ЗП — перерисовываем всё.
  revalidatePath("/", "layout");
  redirect("/admin/sessions");
}

// Правка сессии: дата / сумма / услуга / инструктор. Минуты списаний здесь
// не трогаем — для баланса абонемента есть корректировки с комментарием (4.3).
export async function updateSessionAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const patch: Record<string, unknown> = {};
  const date = String(formData.get("date") ?? "").trim();
  if (DAY_RE.test(date)) patch.date = date;
  const amount = parseVnd(formData.get("amount"));
  if (amount !== null) patch.amount = amount;
  const instructorId = String(formData.get("instructorId") ?? "");
  if (instructorId) patch.instructor_id = instructorId;
  // Формат оплаты, в отличие от остальных полей, разрешаем и СТИРАТЬ: пустое
  // значение здесь — это осознанный выбор «— не указан —» в списке, а не
  // «поле не трогаем». Select приходит с каждой отправкой формы, поэтому
  // отличить одно от другого можно по наличию ключа в самой форме.
  if (formData.has("paymentMethodId")) {
    patch.payment_method_id = String(formData.get("paymentMethodId") ?? "") || null;
  }
  // Примечание, как и способ оплаты, разрешаем стирать: пустое поле здесь —
  // «убрать текст», а не «не трогать».
  if (formData.has("note")) {
    patch.note = String(formData.get("note") ?? "").trim() || null;
  }

  const supabase = await createClient();
  const serviceId = String(formData.get("serviceId") ?? "");
  if (serviceId) {
    // Ту же сессию нельзя ПЕРЕДЕЛАТЬ в абонемент — см. createSessionAction.
    const { data: svc } = await supabase
      .from("services")
      .select("category")
      .eq("id", serviceId)
      .maybeSingle();
    if (svc && svc.category !== "subscription") patch.service_id = serviceId;
  }
  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase.from("sessions").update(patch).eq("id", id);
  failIfError(error, "не удалось сохранить сессию");
  revalidatePath("/", "layout");
}

// Удаление сессии: чек уходит из выручки и ЗП месяца. Если это списание минут
// с абонемента — минуты возвращаются (остаток считается по сессиям), статус
// абонемента пересчитывается.
export async function deleteSessionAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const { data: s } = await supabase
    .from("sessions")
    .select("subscription_id, client_id, agent_commission")
    .eq("id", id)
    .maybeSingle();
  const { error } = await supabase.from("sessions").delete().eq("id", id);
  failIfError(error, "не удалось удалить сессию");
  if (s?.subscription_id) {
    await recalcSubscriptionStatus(supabase, s.subscription_id);
  }
  // Занятия больше нет — значит и награда агенту за него не заработана.
  // Раньше строка в referral_rewards оставалась, и агент получал 300 000 ₫ за
  // сессию, которой нет в базе (комиссия из расходов ушла, выплата осталась).
  await removeSessionReward(supabase, s);
  revalidatePath("/", "layout");
}

// Снять награду агента, начисленную за удалённую сессию.
//
// Прямой ссылки «награда → сессия» в схеме нет: referral_rewards привязана к
// КЛИЕНТУ (см. 0021). Поэтому ищем по трём приметам разом — тот же клиент, тот
// же размер, что зафиксирован на сессии, и статус confirmed — и снимаем ОДНУ,
// самую свежую. Награда пишется только за первое базовое обучение клиента,
// поэтому подходящая строка практически всегда единственная. Не нашли —
// молчим: значит удаляют обычную сессию без агента.
async function removeSessionReward(
  supabase: Awaited<ReturnType<typeof createClient>>,
  session: { client_id?: string | null; agent_commission?: number | null } | null,
) {
  const commission = Number(session?.agent_commission ?? 0);
  if (!session?.client_id || commission <= 0) return;

  const { data: reward } = await supabase
    .from("referral_rewards")
    .select("id")
    .eq("referrer_type", "agent")
    .eq("client_id", session.client_id)
    .eq("amount", commission)
    .eq("status", "confirmed")
    .order("confirmed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!reward) return;

  const { error } = await supabase
    .from("referral_rewards")
    .delete()
    .eq("id", reward.id);
  // Сессия уже удалена — не роняем страницу, но проговариваем в лог: награду
  // админ снимет руками, а вот падение здесь выглядело бы как «не удалилось».
  if (error) console.error("[admin] reward delete error:", error.message);
}

// ── Абонементы (подэтап 4.3) ─────────────────────────────────────────────────
// Пересчёт статуса по остатку минут: кончились ↔ снова появились.
// Истёкший (expired) не воскрешаем.
async function recalcSubscriptionStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  subId: string,
) {
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id, total_minutes, status")
    .eq("id", subId)
    .maybeSingle();
  if (sub && (sub.status === "active" || sub.status === "used_up")) {
    const left = await minutesLeft(supabase, sub);
    const next = left <= 0 ? "used_up" : "active";
    if (next !== sub.status) {
      await supabase.from("subscriptions").update({ status: next }).eq("id", subId);
    }
  }
}

// Продажа от админа: как у инструктора, но продавца выбираем и дату можно
// поставить прошлую. Цена по умолчанию — 6 000 000 ₫. Продавец важен для ЗП:
// абонемент, проданный инструктором, кидает 15% в общий котёл (делится поровну
// между всеми инструкторами), а проданный админом — не кидает, это его прибыль.
export async function adminSellSubscriptionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const sellerId = String(formData.get("sellerId") ?? "");
  if (!sellerId) return { error: "Укажите, кто продал абонемент." };

  const soldDay = String(formData.get("soldDate") ?? "").trim();
  if (!DAY_RE.test(soldDay)) return { error: "Укажите дату продажи." };
  const soldAt = dayToIso(soldDay);

  const priceRaw = String(formData.get("price") ?? "").trim();
  const price = priceRaw ? parseVnd(priceRaw) : 6_000_000;
  if (price === null) return { error: "Цена — число в донгах, например 6 000 000." };

  // Уже проведённую заявку вторично не оформляем — та же защита, что в
  // createSessionAction. Без неё повторный сабмит (кнопка «Назад», зависшая
  // вкладка со старым ?booking=id) создавал ВТОРОЙ абонемент на 6 млн: он
  // задваивался и в выручке, и в котле 15% инструкторов.
  // Проверяем ДО создания клиента: иначе отказ ниже оставил бы клиента-сироту.
  const bookingId = String(formData.get("bookingId") ?? "") || null;
  if (bookingId) {
    const { data: booking } = await supabase
      .from("bookings")
      .select("status")
      .eq("id", bookingId)
      .maybeSingle();
    if (!booking) return { error: "Заявка не найдена." };
    if (booking.status === "done") {
      return {
        error:
          "Эта заявка уже проведена — абонемент продан. Смотрите вкладку «Абонементы».",
      };
    }
  }

  // created_at клиента = дате продажи: абонемент, проданный задним числом, не
  // должен делать клиента «новым в этом месяце» (см. resolveClient).
  const clientRes = await resolveClient(supabase, admin.id, formData, soldAt);
  if ("error" in clientRes) return clientRes;
  const clientId = clientRes.id;

  // Минуты живут 3 месяца С ДАТЫ ПРОДАЖИ (в т.ч. прошлой). paid_at — только
  // при полученной оплате: от месяца оплаты зависят выручка и комиссия.
  const paid = formData.get("paid") === "on";
  // Чем заплатили — спрашиваем ровно при полученной оплате (см. форму).
  const paymentMethodId =
    String(formData.get("paymentMethodId") ?? "").trim() || null;
  if (paid && !paymentMethodId) return { error: "Укажите формат оплаты." };

  const row = {
    client_id: clientId,
    sold_by: sellerId,
    price,
    sold_at: soldAt,
    expires_at: subscriptionExpiry(new Date(soldAt)).toISOString(),
    paid_at: paid ? soldAt : null,
    payment_method_id: paymentMethodId,
  };
  let { error: subError } = await supabase.from("subscriptions").insert(row);
  // До миграции 0025 колонки payment_method_id нет — не роняем продажу из-за
  // неё, сохраняем абонемент без способа оплаты (см. кабинет инструктора).
  if (subError?.code === "PGRST204") {
    const legacy: Partial<typeof row> = { ...row };
    delete legacy.payment_method_id;
    ({ error: subError } = await supabase.from("subscriptions").insert(legacy));
  }
  if (subError) return { error: `Не удалось создать абонемент: ${subError.message}` };

  // Продажа из заявки на абонемент (кнопка «Продать абонемент» в ленте заявок):
  // закрываем заявку и привязываем клиента. Раньше заявка-абонемент шла на
  // «Запись клиента», где список услуг без абонемента → молча писалась сессия
  // базового обучения, а абонемент не создавался вовсе (пачка №5, п.11).
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

  // Клуб пока не запускаем: продажа абонемента НЕ делает клиента членом клуба
  // (как и у инструктора). Членство добавляется руками на вкладке «Члены клуба».

  revalidatePath("/", "layout");
  redirect("/admin/subscriptions");
}

// Тумблер оплаты. Поставить — с датой (по умолчанию сегодня; месяц оплаты
// решает, куда упадут выручка и комиссия). Снять — подтверждение на клиенте:
// отметка уже могла войти в расчёты.
export async function togglePaidAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  let paidAt: string | null = null;
  // Отмечаем оплату — записываем и чем заплатили. Снимаем отметку — стираем
  // способ вместе с ней: оплаты не было, значит и формата у неё нет.
  let paymentMethodId: string | null = null;
  if (formData.get("set") === "1") {
    const day = String(formData.get("paidDate") ?? "").trim();
    paidAt = DAY_RE.test(day) ? dayToIso(day) : new Date().toISOString();
    paymentMethodId = String(formData.get("paymentMethodId") ?? "").trim() || null;
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("subscriptions")
    .update({ paid_at: paidAt, payment_method_id: paymentMethodId })
    .eq("id", id);
  failIfError(error, "не удалось изменить отметку оплаты");
  revalidatePath("/", "layout");
}

// Ручная корректировка минут: только с комментарием (почему), пишется в лог
// subscription_adjustments от имени админа. Может вернуть абонемент из
// used_up в active (и наоборот), но не воскрешает истёкший.
// Прокат по абонементу глазами админа (пачка №6, п.6): клиент откатал минуты —
// это ЗАНЯТИЕ, поэтому пишем сессию (amount = 0) в день проката, а не
// корректировку. Так человек виден в «Сессиях» того дня: «был такой-то,
// откатал 45 минут абонемента».
//
// Раньше у админа была только кнопка «Скорректировать минуты» — она пишет в
// subscription_adjustments и в сессии не попадает вообще. Из-за этого прокаты,
// оформленные админом, в ленте дня не появлялись, хотя списание инструктора
// (у него свой экран) появлялось. Корректировка остаётся для того, ради чего
// задумана: компенсации и исправления ошибок с комментарием в логе.
export async function writeOffMinutesAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const subId = String(formData.get("subscriptionId") ?? "");
  const minutes = Math.trunc(Number(formData.get("minutes")));
  const date = String(formData.get("date") ?? "").trim();
  const instructorId = String(formData.get("instructorId") ?? "");
  if (!subId || !Number.isFinite(minutes) || minutes <= 0) {
    return { error: "Минуты — целое число больше нуля." };
  }
  if (!DAY_RE.test(date)) return { error: "Укажите дату проката." };

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id, client_id, total_minutes, status")
    .eq("id", subId)
    .maybeSingle();
  if (!sub) return { error: "Абонемент не найден." };
  if (sub.status === "cancelled") {
    return { error: "Абонемент отменён — списывать с него нельзя." };
  }

  // В минус не уходим (то же правило, что у инструктора): превышение
  // оформляется отдельной сессией по прайсу проката.
  const left = await minutesLeft(supabase, sub);
  if (minutes > left) {
    return { error: `Остаток ${left} мин — списать ${minutes} нельзя.` };
  }

  const { error } = await supabase.from("sessions").insert({
    client_id: sub.client_id,
    subscription_id: sub.id,
    minutes_used: minutes,
    amount: 0, // прокат по абонементу — деньги получены при его продаже
    instructor_id: instructorId || null,
    created_by: admin.id,
    date,
  });
  if (error) return { error: `Не удалось списать: ${error.message}` };

  await recalcSubscriptionStatus(supabase, subId);

  revalidatePath("/", "layout");
  redirect("/admin/subscriptions");
}

export async function adjustMinutesAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const subId = String(formData.get("subscriptionId") ?? "");
  const delta = Math.trunc(Number(formData.get("delta")));
  const comment = String(formData.get("comment") ?? "").trim();
  if (!subId || !Number.isFinite(delta) || delta === 0) {
    return { error: "Минуты — целое число, не ноль (например 30 или −15)." };
  }
  if (!comment) return { error: "Комментарий обязателен: почему меняем минуты." };

  const { error } = await supabase.from("subscription_adjustments").insert({
    subscription_id: subId,
    delta_minutes: delta,
    comment,
    created_by: admin.id,
  });
  if (error) return { error: `Не удалось сохранить корректировку: ${error.message}` };

  await recalcSubscriptionStatus(supabase, subId);

  revalidatePath("/", "layout");
  redirect("/admin/subscriptions");
}

// Отмена абонемента (пачка №5, п.13): продажа не состоялась — клиент передумал,
// вернули деньги. В отличие от удаления карточка остаётся: видно, что продажа
// была и чем кончилась, а списания и корректировки никуда не деваются.
//
// Отметку оплаты снимаем: отменённый абонемент не должен висеть в выручке
// месяца и в комиссии продавца. Обратно её ставят руками — старую дату оплаты
// мы не помним и выдумывать её нельзя.
export async function cancelSubscriptionAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();

  if (formData.get("set") === "0") {
    // Возврат из отменённых: статус пересчитываем по факту — срок мог выйти,
    // пока абонемент лежал в отменённых, а минуты могли быть откатаны.
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("id, total_minutes, expires_at")
      .eq("id", id)
      .maybeSingle();
    if (!sub) return;
    const left = await minutesLeft(supabase, sub);
    const expired = sub.expires_at !== null && new Date(sub.expires_at) < new Date();
    const status = expired ? "expired" : left <= 0 ? "used_up" : "active";
    const { error } = await supabase
      .from("subscriptions")
      .update({ status })
      .eq("id", id);
    failIfError(error, "не удалось вернуть абонемент из отменённых");
  } else {
    const { error } = await supabase
      .from("subscriptions")
      .update({ status: "cancelled", paid_at: null })
      .eq("id", id);
    failIfError(error, "не удалось отменить абонемент");
  }

  revalidatePath("/", "layout");
}

// Удаление абонемента: вместе с ним удаляются его списания (иначе FK оставит
// «пустые» сессии без абонемента) и корректировки (cascade в БД). Выручка и
// комиссия месяца оплаты пересчитаются сами. Членство клиента не трогаем.
export async function deleteSubscriptionAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const { error: sessionsError } = await supabase
    .from("sessions")
    .delete()
    .eq("subscription_id", id);
  failIfError(sessionsError, "не удалось удалить списания абонемента");
  const { error } = await supabase.from("subscriptions").delete().eq("id", id);
  failIfError(error, "не удалось удалить абонемент");
  revalidatePath("/", "layout");
}

// ── Выплаты агентам (пачка №5, п.7) ──────────────────────────────────────────
// Награда агента и выплата денег — разные вещи. referral_rewards помнит, что
// награда ЗАРАБОТАНА (клиент пришёл и откатал), а agent_payouts — что деньги
// реально отданы: сколько, чем и когда. «К выплате» = подтверждённые награды
// минус сумма выплат.
//
// В расходы школы выплата не идёт: комиссия агента уже попала в расходы в
// момент начисления (sessions.agent_commission, см. lib/finance.ts). Считать её
// второй раз при выплате — задвоить одни и те же деньги.
export async function payAgentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const agentId = String(formData.get("agentId") ?? "");
  if (!agentId) return { error: "Не понял, какому агенту выплата." };

  const amount = parseVnd(String(formData.get("amount") ?? "").trim());
  if (amount === null || amount <= 0) {
    return { error: "Сумма — число в донгах больше нуля, например 300 000." };
  }

  const day = String(formData.get("paidOn") ?? "").trim();
  if (!DAY_RE.test(day)) return { error: "Укажите дату выплаты." };

  const { error } = await supabase.from("agent_payouts").insert({
    agent_id: agentId,
    amount,
    method_id: String(formData.get("methodId") ?? "") || null,
    paid_on: day,
    comment: String(formData.get("comment") ?? "").trim() || null,
    created_by: admin.id,
  });
  if (error) return { error: `Не удалось сохранить выплату: ${error.message}` };

  revalidatePath("/", "layout");
  redirect("/admin/agents");
}

// Ошиблись суммой или датой — выплату можно снести. Отдельного «редактировать»
// не делаем: удалить и внести заново проще и честнее в истории.
export async function deleteAgentPayoutAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const { error } = await supabase.from("agent_payouts").delete().eq("id", id);
  failIfError(error, "не удалось удалить выплату");
  revalidatePath("/", "layout");
}

// ── Клиенты (подэтап 4.4) ────────────────────────────────────────────────────
// Правка карточки клиента: имя, телефон, внутренняя заметка. Телефон храним
// цифрами (как resolveClient) — так работает дедуп при следующих оформлениях.
export async function updateClientAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return;

  // Телефон обязателен (пачка №9, пак 4, п.2): по нему клиента ищут в записи,
  // списании и в базе — карточка без номера бесполезна. Проверяем на сервере,
  // а не только required в разметке: форму отправляют и мимо браузера.
  const phoneRaw = String(formData.get("phone") ?? "").trim();
  if (!isValidPhone(phoneRaw)) throw new Error(PHONE_ERROR);

  // Ник в телеге: пусто — очистить, валидный — сохранить, кривой — отказать.
  // Молча превращать опечатку в null нельзя: админ правил бы заметку, а ник
  // при этом исчезал без единого слова на экране.
  const tgRaw = String(formData.get("telegramUsername") ?? "").trim();
  const telegram = tgRaw ? normalizeTelegram(tgRaw) : null;
  if (tgRaw && !telegram) {
    throw new Error(
      "ник в Telegram: 5–32 символа — буквы, цифры, подчёркивание",
    );
  }

  // Возраст: пусто или мусор → null («не указан»).
  const ageNum = Math.floor(Number(formData.get("age")));
  const supabase = await createClient();
  const { error } = await supabase
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

// Фото клиента (пак B, пункт 7): админ просил возможность вспомнить, как
// человек выглядит — имена в базе повторяются, лица нет.
//
// Отдельный экшен, а не поле в updateClientAction: карточка клиента
// сохраняется через SaveForm без файлов, и подмешивать туда multipart значило
// бы гонять фото при каждом правлении заметки. Пишем под service_role — на
// бакете clients нет политик записи намеренно (0017).
export async function uploadClientPhotoAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

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

// ── Агенты (подэтап 4.5) ─────────────────────────────────────────────────────
// Реф-код: 6 строчных символов без похожих знаков (0/O, 1/l/I) — код диктуют
// вслух и набирают с телефона, путаница недопустима.
const REF_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function randomRefCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += REF_ALPHABET[Math.floor(Math.random() * REF_ALPHABET.length)];
  }
  return code;
}

// Новый агент: users (role=agent, БЕЗ auth_id — вход в систему ему не нужен,
// запись существует ради комиссии и статистики) + agents с уникальным реф-кодом.
// Комиссию не спрашиваем: default 300 000 ₫ задан в БД.
export async function createAgentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  if (!name) return { error: "Укажите имя агента." };
  // Агенту платят комиссию — без телефона его потом не найти (пак 4, п.2).
  if (!isValidPhone(phone)) return { error: PHONE_ERROR };

  const { data: user, error: userError } = await supabase
    .from("users")
    .insert({
      role: "agent",
      name,
      phone: phoneDigits(phone) || phone,
    })
    .select("id")
    .single();
  if (userError || !user) {
    return { error: `Не удалось создать агента: ${userError?.message ?? "?"}` };
  }

  // Коллизия кода маловероятна (31^6 вариантов), но unique-индекс может её
  // поймать — тогда пробуем другой код, а не показываем ошибку человеку.
  let agentError: string | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { error } = await supabase
      .from("agents")
      .insert({ user_id: user.id, ref_code: randomRefCode() });
    if (!error) {
      agentError = null;
      break;
    }
    agentError = error.message;
    if (error.code !== "23505") break; // не unique-конфликт — повтор не поможет
  }
  if (agentError) {
    // users-запись без agents бесполезна и замусорит базу — подчищаем.
    await supabase.from("users").delete().eq("id", user.id);
    return { error: `Не удалось создать агента: ${agentError}` };
  }

  revalidatePath("/", "layout");
  redirect("/admin/agents");
}

// Выключить/включить агента. Выключенный: лендинг /r/<код> перестаёт принимать
// гостей (мягкий редирект на /training), но история и награды остаются.
export async function toggleAgentActiveAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("agents")
    .update({ active: formData.get("active") !== "1" })
    .eq("id", id);
  failIfError(error, "не удалось переключить агента");
  revalidatePath("/", "layout");
}

// ── Члены клуба (подэтап 4.6) ────────────────────────────────────────────────
// Инвайт-ссылка: клиент купил абонемент офлайн → админ шлёт ему /invite/<token>
// в мессенджер → клиент ставит пароль и получает кабинет. Токен живёт 7 дней
// (default в БД), одноразовый (used_at). Повторное нажатие не плодит ссылки:
// живой неиспользованный токен переиспользуем.
export async function createInviteAction(formData: FormData) {
  const admin = await requireAdmin();
  const clientId = String(formData.get("clientId") ?? "");
  if (!clientId) return;

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("invite_tokens")
    .select("id")
    .eq("client_id", clientId)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .limit(1)
    .maybeSingle();
  if (existing) return;

  // randomUUID без дефисов = 32 hex-символа; подобрать нереально, а в
  // мессенджере ссылка остаётся одной строкой.
  const { error } = await supabase.from("invite_tokens").insert({
    token: crypto.randomUUID().replace(/-/g, ""),
    client_id: clientId,
    created_by: admin.id,
  });
  failIfError(error, "не удалось создать инвайт-ссылку");
  revalidatePath("/", "layout");
}

// Сделать клиента членом клуба вручную. Обычно членство создаёт продажа
// абонемента; ручная кнопка — для случаев вроде «прошёл базовое обучение»
// (условия членства ещё уточняются у руководителя).
export async function addMemberAction(formData: FormData) {
  await requireAdmin();
  const clientId = String(formData.get("clientId") ?? "");
  if (!clientId) return;

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("memberships")
    .select("id")
    .eq("client_id", clientId)
    .maybeSingle();
  if (existing) return;

  const { error } = await supabase.from("memberships").insert({ client_id: clientId });
  failIfError(error, "не удалось добавить члена клуба");
  revalidatePath("/", "layout");
}

// «Перенести»: новая дата/время, статус живой — в ленте появится бейдж
// «Перенесена» (по rescheduled_at), но запись продолжает свой цикл.
export async function rescheduleAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const date = String(formData.get("newDate") ?? "").trim();
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  await updateBooking(id, {
    preferred_date: date,
    scheduled_time: String(formData.get("newTime") ?? "").trim() || null,
    rescheduled_at: new Date().toISOString(),
  });
}

// «Сохранить»: обновить поля уже подтверждённой записи, статус не трогаем.
export async function saveBookingAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await updateBooking(id, bookingFields(formData));
}

// «Закрепить/Открепить»: закреплённые записи висят сверху у инструкторов.
export async function togglePinAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await updateBooking(id, { pinned: formData.get("pinned") !== "1" });
}

// «Отменить»: клиент не придёт. Запись пропадает у инструкторов.
export async function cancelBookingAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await updateBooking(id, { status: "cancelled", pinned: false });
}

// ── Услуги (подэтап 4.10) ────────────────────────────────────────────────────
// Справочник services — источник для форм записи, сессий и статистики.
// Удаления нет: на услуги ссылаются bookings и sessions, вместо этого тумблер
// active. Категория задаётся один раз при создании — от неё зависит логика
// (subscription заблокирован в формах сессий).

const SERVICE_CATEGORIES = [
  "training",
  "tandem",
  "rental",
  "tour",
  "subscription",
  "extra",
];

// Правка названия, цены и длительности. Пустая цена/длительность = null
// («по запросу» / без фиксированной длительности).
export async function updateServiceAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("services")
    .update({
      name,
      price: parseVnd(formData.get("price")),
      duration_min: intOrNull(formData.get("duration")),
    })
    .eq("id", id);
  failIfError(error, "не удалось сохранить услугу");
  revalidatePath("/", "layout");
}

// Вкл/выкл: неактивная услуга исчезает из форм, история остаётся целой.
export async function toggleServiceActiveAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("services")
    .update({ active: formData.get("active") !== "1" })
    .eq("id", id);
  failIfError(error, "не удалось переключить услугу");
  revalidatePath("/", "layout");
}

export async function createServiceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "");
  if (!name) return { error: "Укажите название услуги." };
  if (!SERVICE_CATEGORIES.includes(category)) {
    return { error: "Выберите категорию." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("services").insert({
    name,
    category,
    price: parseVnd(formData.get("price")),
    duration_min: intOrNull(formData.get("duration")),
  });
  if (error) {
    return { error: `Не удалось создать услугу: ${error.message}` };
  }
  revalidatePath("/", "layout");
  redirect("/admin/services"); // redirect = чистая форма после успеха
}

// ── Материалы (фиксы после этапа 4) ──────────────────────────────────────────
// Каналы-метки из таблицы materials: ссылка /?src=<код> в рекламе → метка
// приходит с заявкой. Код метки: латиница/цифры/дефис, чтобы ссылка не ломалась.
const SRC_RE = /^[a-z0-9_-]{2,30}$/;

function materialFields(formData: FormData) {
  return {
    label: String(formData.get("label") ?? "").trim(),
    hint: String(formData.get("hint") ?? "").trim() || null,
    src: String(formData.get("src") ?? "").trim().toLowerCase(),
  };
}

export async function createMaterialAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const fields = materialFields(formData);
  if (!fields.label) return { error: "Укажите название канала." };
  if (!SRC_RE.test(fields.src)) {
    return { error: "Метка: 2–30 символов, латиница, цифры, дефис." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("materials").insert(fields);
  if (error) {
    return {
      error:
        error.code === "23505"
          ? `Метка «${fields.src}» уже занята.`
          : `Не удалось создать канал: ${error.message}`,
    };
  }
  revalidatePath("/", "layout");
  redirect("/admin/materials"); // redirect = чистая форма после успеха
}

export async function updateMaterialAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const fields = materialFields(formData);
  if (!id || !fields.label) return { error: "Укажите название канала." };
  if (!SRC_RE.test(fields.src)) {
    return { error: "Метка: 2–30 символов, латиница, цифры, дефис." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("materials").update(fields).eq("id", id);
  if (error) {
    return {
      error:
        error.code === "23505"
          ? `Метка «${fields.src}» уже занята.`
          : `Не удалось сохранить: ${error.message}`,
    };
  }
  revalidatePath("/", "layout");
  return { error: null };
}

// Удаление безопасно: bookings.src хранит метку текстом, FK нет — история
// заявок и статистика источников не трогаются.
export async function deleteMaterialAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const { error } = await supabase.from("materials").delete().eq("id", id);
  failIfError(error, "не удалось удалить канал");
  revalidatePath("/", "layout");
}

// ── Расходы (пак E) ──────────────────────────────────────────────────────────
// Ручные (дополнительные) траты школы: аренда, топливо, инвентарь, реклама…
// Основные расходы (Marina 35%, ЗП 15%, Дэвид+Ромчик 2%) считаются на лету в
// lib/finance и здесь не хранятся.
export async function addExpenseAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();

  const amount = parseVnd(formData.get("amount"));
  if (!amount || amount <= 0) return { error: "Укажите сумму расхода." };

  const dateRaw = String(formData.get("date") ?? "").trim();
  const date = DAY_RE.test(dateRaw) ? dateRaw : vnToday();

  const supabase = await createClient();
  const { error } = await supabase.from("expenses").insert({
    date,
    amount,
    // Категория — из справочника (0016). Необязательна: расход «просто трата»
    // тоже имеет право на жизнь, и заставлять заводить категорию ради него
    // значило бы засорять справочник одноразовыми позициями.
    category_id: String(formData.get("categoryId") ?? "").trim() || null,
    comment: String(formData.get("comment") ?? "").trim() || null,
    created_by: admin.id,
  });
  if (error) return { error: `Не удалось добавить расход: ${error.message}` };

  revalidatePath("/", "layout");
  return { error: null };
}

export async function deleteExpenseAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  failIfError(error, "не удалось удалить расход");
  revalidatePath("/", "layout");
}

// ── Смены / выходы (пак H1) ───────────────────────────────────────────────────
// Админ ставит инструктору смену на день (планирование наперёд). unique-индекс
// (instructor_id, date) гасит дубли — повторный клик не создаёт вторую строку.
export async function assignShiftAction(formData: FormData) {
  const admin = await requireAdmin();
  const instructorId = String(formData.get("instructorId") ?? "");
  const date = String(formData.get("date") ?? "");
  if (!instructorId || !DAY_RE.test(date)) return;

  const supabase = await createClient();
  const { error } = await supabase.from("shifts").insert({
    instructor_id: instructorId,
    date,
    note: String(formData.get("note") ?? "").trim() || null,
    created_by: admin.id,
  });
  // 23505 = смена уже стоит, это не ошибка (гонка/повторный клик).
  if (error?.code !== "23505") failIfError(error, "не удалось поставить смену");
  revalidatePath("/", "layout");
}

// Премия за выход (пачка №9, пак 2). Регламент считает машина: открыл до 9:00,
// закрыл после 18:00, смена закрыта — 300 000 ₫. Но живую смену машина не
// видит: шторм, поломка, подмена напарника. Поэтому последнее слово за админом
// — он снимает премию руками и пишет причину, чтобы через месяц при разборе
// «почему у него на 300к меньше» был внятный ответ.
//
// Ставить премию обратно тоже можно (снял по ошибке) — та же кнопка со
// значением 0. Автоматический вердикт при этом не меняется: если смена открыта
// после 9:00, снятие «обратно» её не оплатит.
export async function setShiftBonusAction(formData: FormData) {
  await requireAdminOrMechanic();
  const instructorId = String(formData.get("instructorId") ?? "");
  const date = String(formData.get("date") ?? "");
  if (!instructorId || !DAY_RE.test(date)) return;

  const cancelled = formData.get("cancelled") === "1";
  const comment = String(formData.get("comment") ?? "").trim();

  // service_role: у механика прав на запись в shifts нет и не будет (0020 —
  // иначе он смог бы править и время открытия своей смены). Какие именно
  // колонки меняются, решает этот код.
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("shifts")
    .update({
      bonus_cancelled: cancelled,
      // Вернули премию — причина больше не описывает реальность, стираем.
      bonus_comment: cancelled ? comment || null : null,
    })
    .eq("instructor_id", instructorId)
    .eq("date", date);
  failIfError(error, "не удалось изменить премию за смену");
  revalidatePath("/", "layout");
}

export async function removeShiftAction(formData: FormData) {
  await requireAdmin();
  const instructorId = String(formData.get("instructorId") ?? "");
  const date = String(formData.get("date") ?? "");
  if (!instructorId || !DAY_RE.test(date)) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("shifts")
    .delete()
    .eq("instructor_id", instructorId)
    .eq("date", date);
  failIfError(error, "не удалось убрать смену");
  revalidatePath("/", "layout");
}

// ── Справочники: категории расходов и форматы оплаты (пачка №4, пак A) ────────
// Обе таблицы устроены одинаково (name + active), поэтому экшены общие, а какой
// именно справочник править — приходит полем формы. Валидируем имя таблицы по
// белому списку: иначе значением из формы можно было бы дотянуться до любой
// таблицы базы.
const DICT_TABLES: DictTable[] = ["expense_categories", "payment_methods"];

function dictTable(formData: FormData): DictTable | null {
  const table = String(formData.get("table") ?? "");
  return (DICT_TABLES as string[]).includes(table) ? (table as DictTable) : null;
}

export async function addDictItemAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const table = dictTable(formData);
  if (!table) return { error: "Неизвестный справочник." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Введите название." };

  const supabase = await createClient();
  const { error } = await supabase.from(table).insert({ name });
  // 23505 = такое имя уже есть. Для человека это не ошибка ввода, а «оно уже
  // заведено» — говорим прямо, вместо сырого текста от Postgres.
  if (error?.code === "23505") {
    return { error: `«${name}» уже есть в справочнике.` };
  }
  if (error) return { error: `Не удалось добавить: ${error.message}` };

  revalidatePath("/", "layout");
  return { error: null };
}

// Скрыть/вернуть позицию. Именно скрыть, а не удалить: на категорию могут
// ссылаться прошлые расходы, на формат оплаты — прошлые сессии. Удаление
// оборвало бы ссылку и обнулило историю.
export async function toggleDictItemAction(formData: FormData) {
  await requireAdmin();

  const table = dictTable(formData);
  const id = String(formData.get("id") ?? "");
  if (!table || !id) return;

  const active = String(formData.get("active") ?? "") === "true";

  const supabase = await createClient();
  const { error } = await supabase.from(table).update({ active }).eq("id", id);
  failIfError(error, `не удалось изменить справочник (${DICT_LABEL[table]})`);
  revalidatePath("/", "layout");
}

// ── Инвентарь: доски и крылья (пачка №4, пак C) ──────────────────────────────
// Похоже на словари выше, но с колонкой kind: фото смены привязывается к
// КОНКРЕТНОЙ единице. Скрываем, а не удаляем — на единицу ссылаются прошлые
// фото смен, удаление оборвало бы связь.
const EQUIPMENT_KINDS: EquipmentKind[] = ["board", "wing"];

export async function addEquipmentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const kind = String(formData.get("kind") ?? "") as EquipmentKind;
  if (!EQUIPMENT_KINDS.includes(kind)) return { error: "Выберите доску или крыло." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Введите название." };

  const supabase = await createClient();
  const { error } = await supabase.from("equipment").insert({ kind, name });
  // 23505 = такая единица уже заведена (unique kind+name).
  if (error?.code === "23505") {
    return { error: `«${name}» уже есть в списке.` };
  }
  if (error) return { error: `Не удалось добавить: ${error.message}` };

  revalidatePath("/", "layout");
  return { error: null };
}

export async function toggleEquipmentAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const active = String(formData.get("active") ?? "") === "true";
  const supabase = await createClient();
  const { error } = await supabase.from("equipment").update({ active }).eq("id", id);
  failIfError(error, "не удалось изменить инвентарь");
  revalidatePath("/", "layout");
}
