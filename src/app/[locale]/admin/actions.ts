"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  cabinetBase,
  getActiveAppUser,
  isAdminLike,
  isOffice,
  type AppRole,
} from "@/lib/auth";
import {
  phoneDigits,
  phonesMatch,
  isValidPhone,
  normalizeTelegram,
  PHONE_ERROR,
} from "@/lib/phone";
import { subscriptionExpiry, vnIsoAt, vnToday } from "@/lib/dates";
import { minutesLeft } from "@/lib/subscriptions";
import { writeOffSubscription } from "@/lib/subscriptionWriteOff";
import { parseRiders, writeOffNote } from "@/lib/riders";
import { sendInstructorsBookingAlert } from "@/lib/telegram";
import { pickChannel } from "@/lib/channels";
import { DICT_LABEL, type DictTable } from "@/lib/dictionaries";
import type { EquipmentKind } from "@/lib/equipment";
import { parseVnd } from "@/lib/money";
import { checkPhoto } from "@/lib/photos";
import { replacePrivateClientPhoto } from "@/lib/privateStorage";
import {
  agentCommissionFor,
  agentRewardApplies,
  applyRefDiscount,
  asAgentPlan,
  DEFAULT_AGENT_PLAN,
  type AgentPlan,
} from "@/lib/agentReward";
import { loadAllClients } from "@/lib/clients";
import { BOSS_DAY_SHARE_FROM } from "@/lib/salary";
import {
  claimBooking,
  linkBookingResult,
  releaseBooking,
  type BookingClaimState,
} from "@/lib/bookingClaim";
import type { ActionState } from "../instructor/actions";

// Server actions админки: полный цикл заявки. Админ созванивается с гостем,
// вносит время/возраст/вес и подтверждает — заявка становится «записью»,
// которую видят инструкторы. RLS-политика bookings_admin_all даёт полный доступ.

// Разработчик (0044) — тот же админ: и права, и кабинет у него админские,
// поэтому все экшены админки открыты и ему.
async function requireAdmin() {
  const user = await getActiveAppUser();
  if (!user || !isAdminLike(user.role)) redirect("/login?next=/admin");
  return user;
}

// Два действия админки делает и механик — он такой же человек на пляже:
// заводит заявку на подошедшего гостя и снимает премию за выход, если смену
// отработали не по-людски (оборудование после этого чинит он). Обе проверки
// живут в коде, а не в RLS: премию пишем service_role-клиентом (см. 0020 —
// политика не умеет ограничивать набор колонок).
async function requireAdminOrMechanic() {
  const user = await getActiveAppUser();
  if (!user || !(isAdminLike(user.role) || user.role === "mechanic")) {
    redirect("/login?next=/admin");
  }
  return user;
}

// «Офис» — админ и СММщик (0039). У СММщика те же разделы, что у админа, за
// вычетом календаря, выплат, услуг и членов клуба; экшены этих разделов
// по-прежнему требуют requireAdmin, чтобы их нельзя было дёрнуть запросом
// мимо интерфейса.
// Завести заявку может кто угодно из тех, к кому приходит гость: админ,
// механик (подошли на пляже) и СММщик (написали в директ). Премию за смену
// или ленту заявок это право не открывает — для них свои проверки.
async function requireBookingAuthor() {
  const user = await getActiveAppUser();
  if (!user || !(isAdminLike(user.role) || ["mechanic", "smm"].includes(user.role))) {
    redirect("/login?next=/admin");
  }
  return user;
}

async function requireOffice() {
  const user = await getActiveAppUser();
  if (!user || !isOffice(user.role)) redirect("/login?next=/admin");
  return user;
}

// Клиент для ЗАПИСИ от лица офиса. Админ пишет своим (у него полные политики
// *_admin_all), СММщику политик на запись не выдано вовсе (0040) — он пишет
// служебным ключом, как инструктор с 0030. Смысл тот же: что именно меняется,
// решает этот код, а не RLS, который не умеет ограничивать набор колонок.
// Побочный эффект приятный: своим ключом мимо интерфейса СММщик не изменит
// ничего.
async function officeClient(user: { role: AppRole }) {
  return isAdminLike(user.role) ? await createClient() : createAdminClient();
}

// Куда возвращать после сохранения: в кабинет того, кто сохранял. Раньше все
// эти экшены редиректили жёстко в /admin/... — СММщика оттуда выбросил бы
// proxy.ts, и он видел бы не результат, а свою же ленту заявок.
function officeRedirect(user: { role: AppRole }, path: string): never {
  redirect(`${cabinetBase(user.role)}${path}`);
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
    // Город правится из карточки заявки: у заявок с сайта его нет вовсе (гость
    // город не указывает), а знать, откуда гость, нужно. Ключ добавляем только
    // если поле реально пришло с формой — иначе форма без него стирала бы
    // сохранённый город.
    ...(formData.has("city")
      ? { city: String(formData.get("city") ?? "").trim() || null }
      : {}),
    // «Клиент уже заплатил» (0036): написал в инстаграм, сразу перевёл деньги,
    // катается послезавтра. Раньше это было некуда записать, и инструктор на
    // пляже спрашивал деньги второй раз. Это ПОМЕТКА, а не выручка: деньги
    // по-прежнему считаются в момент записи занятия, иначе один платёж попал
    // бы в отчёты дважды. Ключ добавляем только если чекбокс был в форме —
    // формы без него (карточка заявки с сайта) не должны стирать отметку.
    ...(formData.has("paidMark") ? { paid: formData.get("paidMark") === "on" } : {}),
    // Когда именно заплатили (0042). Нужна для случая «перевёл в прошлом
    // месяце, катается в этом»: дата переедет в занятие, и чек ляжет в кассу
    // того месяца, когда деньги пришли. Пусто = платили в день занятия.
    ...(formData.has("paidOn")
      ? { paid_on: String(formData.get("paidOn") ?? "").trim() || null }
      : {}),
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
async function updateBooking(
  user: { role: AppRole },
  id: string,
  patch: Record<string, unknown>,
) {
  const supabase = await officeClient(user);
  // Колонки paid (0036) и paid_on (0042) в боевой базе есть — повтор запроса
  // без них убран 16.08.2026: он тихо сохранял заявку БЕЗ отметки об оплате,
  // и админ видел «сохранено», а галочка не держалась.
  const { error } = await supabase.from("bookings").update(patch).eq("id", id);
  failIfError(error, "не удалось сохранить заявку");
  revalidatePath("/", "layout");
}

// Сообщение в группу инструкторов: «появилась новая запись, кто примет?»
// Телефон клиента в группу не шлём — только номер, услуга и время.
async function notifyInstructors(id: string) {
  // Служебным ключом: это чтение ради сообщения в Telegram, и оно должно
  // работать одинаково у админа и у СММщика (политик на bookings ему хватает,
  // но зависеть от них тут незачем).
  const supabase = createAdminClient();
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
  const author = await requireBookingAuthor();

  const clientName = String(formData.get("clientName") ?? "").trim();
  if (!clientName) return { error: "Укажите имя клиента." };
  const phone = String(formData.get("phone") ?? "").trim();
  if (!phone) return { error: "Укажите телефон клиента." };

  // Канал: ключ из списка или свой текст из пункта «Другой…» (lib/channels).
  const channel = pickChannel(formData.get("channel"), formData.get("channelOther"));
  if (!channel) return { error: "Укажите канал записи." };

  // Город обязателен: required в разметке — подсказка, правило здесь.
  const city = String(formData.get("city") ?? "").trim();
  if (!city) return { error: "Укажите город клиента." };

  const preferredDate = String(formData.get("preferredDate") ?? "").trim();
  if (preferredDate && !DAY_RE.test(preferredDate))
    return { error: "Дата — в формате ГГГГ-ММ-ДД." };

  const serviceId = String(formData.get("serviceId") ?? "");
  const confirmed = formData.get("status") !== "new";

  // После проверки активной роли: механик и СММ пишут только заданные ниже
  // поля через сервер; прямые INSERT в PostgREST закрыты миграцией 0055.
  const supabase = await officeClient(author);
  const row = {
    client_name: clientName,
    phone,
    service_id: serviceId || null,
    preferred_date: preferredDate || null,
    status: confirmed ? "confirmed" : "new",
    src: channel,
    // Формат оплаты сюда приходит из bookingFields: в заявке он
    // необязателен — клиент ещё не платил (пак A). Оттуда же галочка «уже
    // оплачено» — она, наоборот, про «деньги получены до занятия» (0036).
    ...bookingFields(formData),
    city,
  };
  const { data: created, error } = await supabase
    .from("bookings")
    .insert(row)
    .select("id")
    .single();
  if (error || !created) {
    return { error: `Не удалось создать заявку: ${error?.message ?? "неизвестно"}` };
  }

  // Инструкторам сообщаем только о том, что уже подтверждено — как и с сайта.
  if (confirmed) await notifyInstructors(created.id as string).catch(() => {});

  revalidatePath("/", "layout");
  // У механика ленты заявок нет — возвращаем его на ту же форму с плашкой
  // «заявка ушла инструкторам», чтобы он мог записать следующего. Остальные
  // идут в ленту своего кабинета.
  if (author.role === "mechanic") redirect("/mechanic/record?created=1");
  officeRedirect(author, "/bookings");
}

// «Подтвердить»: сохранить данные созвона и опубликовать запись инструкторам.
export async function confirmBookingAction(formData: FormData) {
  const user = await requireOffice();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await updateBooking(user, id, { ...bookingFields(formData), status: "confirmed" });
  await notifyInstructors(id).catch(() => {});
}

// Смена статуса из карточки: в обработке / подтверждена / выполнена / отменена /
// в архив. Побочные эффекты завязаны на статус, а не на кнопку, чтобы работать
// одинаково из любого места ленты.
// Статус приходит первым аргументом через .bind() на кнопке: React НЕ кладёт
// name/value кнопки в FormData при formAction-функции — через name="status"
// сюда приходила пустота, и все кнопки статусов молча не работали.
export async function setStatusAction(status: string, formData: FormData) {
  const user = await requireOffice();
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
  await updateBooking(user, id, patch);
  if (status === "confirmed") await notifyInstructors(id).catch(() => {});
}

// «Учтена в занятии» (0038): заявка-спутник закрывается ЧУЖИМ занятием.
//
// Живой случай — мама записала себя и дочку двумя заявками, а инструктор
// провёл одно парное обучение за 3,5 млн. Раньше вторую заявку оставалось
// только «Отменить»: в CRM дочка выглядела отказом, хотя каталась, и воронка
// «Источников» считала её потерянным клиентом. Теперь заявка встаёт
// «Выполнена» и указывает на то же занятие — денег это не добавляет (выручка
// живёт на сессии, а сессия одна).
export async function coverBookingAction(formData: FormData) {
  const user = await requireOffice();
  const id = String(formData.get("id") ?? "");
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!id || !sessionId) return;

  const supabase = await officeClient(user);
  // Занятие должно существовать: id приходит из формы, а формам не верим.
  // Заодно берём его клиента — заявка-спутник должна указывать на того же
  // человека, иначе она не попадёт в «закрытые занятием» (isClosedDeal).
  const { data: session } = await supabase
    .from("sessions")
    .select("id, client_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return;

  const { error } = await supabase
    .from("bookings")
    .update({
      status: "done",
      pinned: false,
      session_id: session.id,
      client_id: session.client_id,
    })
    .eq("id", id);
  // Молча делать вид, что заявка закрыта занятием, нельзя: человек увидит
  // «Выполнена» без связи и решит, что всё в порядке.
  failIfError(error, "не удалось привязать занятие");
  revalidatePath("/", "layout");
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

  const city = String(formData.get("newCity") ?? "").trim();

  const { rows: existing } = await loadAllClients<{
    id: string;
    phone: string | null;
    telegram_username: string | null;
    city: string | null;
  }>(supabase, "id, phone, telegram_username, city", { onlyWithPhone: true });
  const match = existing.find((c) => phonesMatch(c.phone, phone));
  if (match) {
    // Ник и город дописываем только в пустые поля — см. findOrCreateClient.
    // Раньше город у существующего клиента просто выбрасывался: поле в форме
    // заполняли, а в карточке оно так и оставалось пустым.
    const patch: Record<string, string> = {};
    if (telegram && !match.telegram_username) patch.telegram_username = telegram;
    if (city && !match.city) patch.city = city;
    if (Object.keys(patch).length > 0) {
      await supabase.from("clients").update(patch).eq("id", match.id);
    }
    return { id: match.id };
  }

  const { data: created, error } = await supabase
    .from("clients")
    .insert({
      name,
      phone: phoneDigits(phone) || phone,
      city: city || null,
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

// Смена начальника, открытая записью клиента (решение David от 04.09.2026).
//
// Босс иногда катает сам. Раньше его чек выпадал из дня ЦЕЛИКОМ: 15% с него не
// получал никто, включая напарника, который в этот день реально работал.
// Теперь запись занятия НА СЕБЯ — это и есть отметка «я сегодня на пляже»:
// заводим смену на дату занятия, и дележ дня начинает её видеть
// (lib/salary → getSessionShare).
//
// Открываем и закрываем ОДНИМ моментом. Регламент 9:00/18:00 к боссу не
// применяется: 200 000 ₫ за выход ему всё равно не платят (его нет в
// SHIFT_CREW_ROLES), зато незакрытая смена висела бы в календаре и в отчёте
// дня как забытая. Решение David: «админу пох на время, главное чтобы открыл».
//
// Занятие задним числом отмечаем полуднем ТОГО дня: сегодняшний timestamp на
// прошлой дате врал бы в календаре.
//
// Пишем клиентом админа — политика shifts_admin_all (0014) это разрешает,
// служебный ключ здесь не нужен.
async function openBossShift(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  date: string,
): Promise<void> {
  // Правило заработало 1 сентября 2026 и назад не смотрит (см. lib/salary →
  // BOSS_DAY_SHARE_FROM). Смена на августовский день ничего не изменила бы в
  // деньгах, зато осталась бы в календаре непонятной строкой.
  if (date < BOSS_DAY_SHARE_FROM) return;

  const at =
    date === vnToday()
      ? new Date().toISOString()
      : (vnIsoAt(date, "12:00") ?? new Date().toISOString());

  const { data: existing } = await supabase
    .from("shifts")
    .select("id, opened_at")
    .eq("instructor_id", userId)
    .eq("date", date)
    .maybeSingle();

  // Смену этого дня уже открывали — время не переписываем: второй записанный
  // клиент не делает выход «более открытым».
  if (existing?.opened_at) return;

  const { error } = existing
    ? await supabase
        .from("shifts")
        .update({ opened_at: at, closed_at: at })
        .eq("id", existing.id as string)
    : await supabase.from("shifts").insert({
        instructor_id: userId,
        date,
        planned: false,
        opened_at: at,
        closed_at: at,
        note: "Смена открыта записью клиента",
        created_by: userId,
      });

  // Не кидаем по той же причине, что и с наградой агента ниже: занятие уже
  // записано, и ошибка на экране толкнула бы админа оформить его второй раз —
  // получили бы дубль чека в выручке. Смену в крайнем случае поставит он сам.
  // 23505 = её только что завёл параллельный запрос, это вообще не ошибка.
  if (error && error.code !== "23505") {
    console.error("[admin] boss shift open error:", error.message);
  }
}

// Создать сессию задним числом: инструктор забыл оформить занятие — админ
// вносит его вручную на любую дату. Тем же экшеном пользуется админская
// «Запись клиента» (может закрыть заявку и учесть реф-скидку/награду — см.
// bookingId ниже). Чек фиксируется в момент создания (изменение прайса в
// будущем прошлые сессии не трогает).
export async function createSessionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireOffice();
  const supabase = await officeClient(user);

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
  // commission_fixed из карточки агента больше не читаем: с 16.08.2026 размер
  // награды зависит от услуги (lib/agentTerms). А с 17.08.2026 — ещё и от
  // тарифа агента (agents.terms_plan, 0046): у одного партнёра свои условия.
  let agent: { id: string; plan: AgentPlan } | null = null;
  // Прежнее состояние заявки — для отката, если после захвата занятие не
  // запишется (см. lib/bookingClaim).
  let bookingBefore: BookingClaimState | null = null;
  if (bookingId) {
    const { data: booking } = await supabase
      .from("bookings")
      .select("status, client_id, payment_method_id, ref_code, services(category)")
      .eq("id", bookingId)
      .maybeSingle();
    if (!booking) return { error: "Заявка не найдена." };
    bookingBefore = {
      status: booking.status as string,
      client_id: (booking.client_id as string | null) ?? null,
      payment_method_id: (booking.payment_method_id as string | null) ?? null,
    };
    // Уже проведённую заявку вторично не оформляем: кнопка «Назад», повторный
    // сабмит или забытая вкладка со старым ?booking=id записывали ВТОРОЕ
    // занятие и ВТОРУЮ награду агенту — чек задваивался в выручке и ЗП.
    // От двух устройств сразу это не спасает — для этого захват ниже.
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
        .select("id, terms_plan")
        .eq("ref_code", booking.ref_code)
        .eq("active", true)
        .maybeSingle();
      agent = data
        ? { id: data.id as string, plan: asAgentPlan(data.terms_plan) }
        : null;
    }
  }
  // Тариф нужен и там, где агента нет: функции условий требуют его всегда, а
  // без агента они всё равно возвращают ноль.
  const plan = agent?.plan ?? DEFAULT_AGENT_PLAN;

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

  // Город и канал записи спрашивает «Записать клиента»; форма сессий их не
  // шлёт (там вносят прошлое, где канала уже не вспомнить) — поэтому проверяем
  // только те поля, что реально пришли с формой.
  if (formData.has("newCity") && !String(formData.get("newCity") ?? "").trim()) {
    return { error: "Укажите город клиента." };
  }
  const channel = formData.has("channel")
    ? pickChannel(formData.get("channel"), formData.get("channelOther"))
    : null;
  if (formData.has("channel") && !channel) {
    return { error: "Укажите канал записи." };
  }

  // Клиент — последним из проверок: всё, что могло отказать, уже отказало.
  // created_at = дате занятия (см. resolveClient).
  const clientRes = await resolveClient(supabase, user.id, formData, dayToIso(date));
  if ("error" in clientRes) return clientRes;
  const clientId = clientRes.id;

  // Заработал ли агент на этом занятии: только первое базовое обучение
  // клиента (в т.ч. парное) — то же правило, что в кабинете инструктора.
  const rewarded = await agentRewardApplies(supabase, {
    hasAgent: Boolean(agent),
    serviceCode: service.code as string | null,
    clientId,
    plan,
  });

  // Пустая сумма = по прайсу (минус агентская скидка, если она положена);
  // введённая вручную — важнее (админ решает: скидки, брони, доплаты).
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const amount: number | null = amountRaw
    ? parseVnd(amountRaw)
    : applyRefDiscount(
        Number(service.price ?? 0),
        service.code as string | null,
        rewarded,
        plan,
      );
  if (amount === null) return { error: "Сумма — число в донгах, например 1 500 000." };

  // Сколько школа платит агенту за такую запись: на стандартном тарифе
  // 200 000 ₫ за базовое и 300 000 ₫ за парное, на процентном — доля от чека
  // (lib/agentTerms). Поэтому считаем ПОСЛЕ суммы: 20% берутся с того, что
  // гость реально заплатил, включая сумму, вписанную админом руками.
  const commission = rewarded
    ? agentCommissionFor(service.code as string | null, amount, plan)
    : 0;

  // Формат оплаты (пак A, пункт 6). У админа обязателен так же, как у
  // инструктора: сессия задним числом — тоже состоявшаяся оплата.
  const paymentMethodId = String(formData.get("paymentMethodId") ?? "").trim();
  if (!paymentMethodId) return { error: "Укажите формат оплаты." };

  // Когда пришли деньги (0042). Форма может прислать свою дату («Записать
  // клиента» у админа), иначе берём ту, что стоит в заявке: гость заплатил
  // при переписке в прошлом месяце, а катается сейчас. Отдельным запросом —
  // чтобы до наката 0042 отсутствие колонки не роняло чтение заявки целиком.
  const paidOnRaw = String(formData.get("paidOn") ?? "").trim();
  if (paidOnRaw && !DAY_RE.test(paidOnRaw)) {
    return { error: "Дата оплаты — в формате ГГГГ-ММ-ДД." };
  }
  let paidOn: string | null = paidOnRaw || null;
  if (!paidOn && bookingId) {
    const { data: paidRow } = await supabase
      .from("bookings")
      .select("paid_on")
      .eq("id", bookingId)
      .maybeSingle();
    paidOn = (paidRow?.paid_on as string | null) ?? null;
  }

  // Заявку занимаем ДО записи занятия: пометка «выполнена» ставится одним
  // запросом с условием «если ещё не выполнена», поэтому из двух одновременных
  // оформлений (админ и инструктор с разных устройств) проходит ровно одно.
  // Способ оплаты уезжает в заявку заодно: в ленте сразу видно, чем клиент
  // расплатился, без похода в сессии. См. lib/bookingClaim.
  if (bookingId && bookingBefore) {
    const claim = await claimBooking(supabase, bookingId, {
      client_id: clientId,
      payment_method_id: paymentMethodId,
    });
    if (claim.error) return { error: `Не удалось создать сессию: ${claim.error}` };
    if (!claim.claimed) {
      return {
        error: "Эта заявка уже проведена — занятие записано. Смотрите вкладку «Сессии».",
      };
    }
  }

  // Комиссию агента фиксируем на сессии: с неё начинается вся остальная
  // арифметика занятия — 35% Marina, 15% инструкторам и 2% CRM считаются с
  // чека МИНУС эта комиссия (lib/finance). Ставим её там же, где положена
  // награда, даже если сумму админ ввёл руками: агент привёл клиента
  // независимо от чека.
  const sessionRow = {
    client_id: clientId,
    service_id: serviceId,
    instructor_id: instructorId,
    date,
    amount,
    agent_commission: commission,
    payment_method_id: paymentMethodId,
    // Как человек записался на это занятие (0034). Заявка не создаётся, когда
    // клиента оформляют сразу на пляже, — иначе канал терялся бы совсем.
    channel,
    // Пусто = платили в день занятия (0042).
    ...(paidOn ? { paid_on: paidOn } : {}),
    note: String(formData.get("note") ?? "").trim() || null,
    created_by: user.id,
  };
  const { data: session, error: insError } = await supabase
    .from("sessions")
    .insert(sessionRow)
    .select("id")
    .single();
  if (insError) {
    // Занятие не записалось — заявка не должна остаться «проведённой».
    if (bookingId && bookingBefore) await releaseBooking(supabase, bookingId, bookingBefore);
    return { error: `Не удалось создать сессию: ${insError.message}` };
  }

  // Заявка запоминает своё занятие (0038): в ленте видно, чем она закрыта, а
  // заявки, закрытые в никуда, перестают теряться.
  if (bookingId && session) {
    await linkBookingResult(supabase, bookingId, { session_id: session.id as string });
  }

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
      amount: commission,
      status: "confirmed",
      confirmed_at: dayToIso(date),
    });
    // Не кидаем: сессия уже записана. Ошибка «не сохранилось» толкнула бы
    // админа оформить занятие второй раз — получили бы дубль чека в выручке.
    // Награду в крайнем случае восстановит админ, дубль денег — нет.
    if (rewardError) console.error("[admin] reward insert error:", rewardError.message);
  }

  // Начальник записал занятие на СЕБЯ = он в этот день был на пляже: открываем
  // ему смену, чтобы 15% дня делились между ним и напарником. Флаг autoShift
  // шлёт только форма «Записать клиента» — во вкладке «Сессии» админ вносит
  // чужое прошлое, и смена там означала бы неправду. Роль admin здесь точная,
  // а не isAdminLike: правило David'а — про начальника, разработчик по-прежнему
  // босс без смен и долей (staff → DAY_SHARE_BOSS_ROLES).
  if (
    user.role === "admin" &&
    instructorId === user.id &&
    formData.get("autoShift") === "1"
  ) {
    await openBossShift(supabase, user.id, date);
  }
  // Заявка уже закрыта захватом выше.

  // Сессия влияет на выручку, статистику и ЗП — перерисовываем всё.
  revalidatePath("/", "layout");
  officeRedirect(user, "/sessions");
}

// Правка сессии: дата / сумма / услуга / инструктор. Минуты списаний здесь
// не трогаем — для баланса абонемента есть корректировки с комментарием (4.3).
export async function updateSessionAction(formData: FormData) {
  const user = await requireOffice();
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
  // Дата оплаты (0042): пусто — значит платили в день занятия, и чек считается
  // в месяце занятия, как раньше. Стирать разрешаем по той же причине, что и
  // способ оплаты: поле приходит с каждой отправкой формы.
  if (formData.has("paidOn")) {
    const paidOn = String(formData.get("paidOn") ?? "").trim();
    if (!paidOn || DAY_RE.test(paidOn)) patch.paid_on = paidOn || null;
  }

  const supabase = await officeClient(user);
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
  const user = await requireOffice();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await officeClient(user);
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
  const user = await requireOffice();
  const supabase = await officeClient(user);

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
  // От двух устройств сразу это не спасает — для этого захват ниже.
  const bookingId = String(formData.get("bookingId") ?? "") || null;
  let bookingBefore: BookingClaimState | null = null;
  if (bookingId) {
    const { data: booking } = await supabase
      .from("bookings")
      .select("status, client_id, payment_method_id")
      .eq("id", bookingId)
      .maybeSingle();
    if (!booking) return { error: "Заявка не найдена." };
    if (booking.status === "done") {
      return {
        error:
          "Эта заявка уже проведена — абонемент продан. Смотрите вкладку «Абонементы».",
      };
    }
    bookingBefore = {
      status: booking.status as string,
      client_id: (booking.client_id as string | null) ?? null,
      payment_method_id: (booking.payment_method_id as string | null) ?? null,
    };
  }

  // created_at клиента = дате продажи: абонемент, проданный задним числом, не
  // должен делать клиента «новым в этом месяце» (см. resolveClient).
  const clientRes = await resolveClient(supabase, user.id, formData, soldAt);
  if ("error" in clientRes) return clientRes;
  const clientId = clientRes.id;

  // Минуты живут 3 месяца С ДАТЫ ПРОДАЖИ (в т.ч. прошлой). paid_at — только
  // при полученной оплате: от месяца оплаты зависят выручка и комиссия.
  const paid = formData.get("paid") === "on";
  // Дата оплаты может отличаться от даты продажи: купили в конце июля, деньги
  // принесли в августе. Раньше paid_at жёстко равнялся дате продажи, и такой
  // абонемент уезжал в чужой месяц — и в выручке, и в котле 15%. Пустое поле
  // (старая вкладка) — это по-прежнему день продажи.
  const paidDay = String(formData.get("paidDate") ?? "").trim();
  if (paid && paidDay && !DAY_RE.test(paidDay))
    return { error: "Дата оплаты указана неверно." };
  const paidAt = paid ? dayToIso(paidDay || soldDay) : null;
  // Чем заплатили — спрашиваем ровно при полученной оплате (см. форму).
  const paymentMethodId =
    String(formData.get("paymentMethodId") ?? "").trim() || null;
  if (paid && !paymentMethodId) return { error: "Укажите формат оплаты." };

  // Заявку занимаем ДО создания абонемента — иначе два одновременных
  // оформления заводят клиенту два абонемента по 6 млн (см. lib/bookingClaim).
  // Продажа из заявки на абонемент — это кнопка «Продать абонемент» в ленте
  // заявок: раньше заявка-абонемент шла на «Запись клиента», где список услуг
  // без абонемента → молча писалась сессия базового обучения, а абонемент не
  // создавался вовсе (пачка №5, п.11).
  if (bookingId && bookingBefore) {
    const claim = await claimBooking(supabase, bookingId, {
      client_id: clientId,
      payment_method_id: paymentMethodId,
    });
    if (claim.error) return { error: `Не удалось создать абонемент: ${claim.error}` };
    if (!claim.claimed) {
      return {
        error:
          "Эта заявка уже проведена — абонемент продан. Смотрите вкладку «Абонементы».",
      };
    }
  }

  // «15% в общий котёл» (0048): галочка стоит только у продажи босса — у
  // полевого состава котёл считается по факту продажи, и флаг ни на что не
  // влияет. Пишем как есть: разбираться, чья это продажа, — дело lib/salary.
  const row = {
    client_id: clientId,
    sold_by: sellerId,
    price,
    sold_at: soldAt,
    expires_at: subscriptionExpiry(new Date(soldAt)).toISOString(),
    paid_at: paidAt,
    payment_method_id: paymentMethodId,
    pool_share: formData.get("poolShare") === "on",
  };
  // payment_method_id (0025) в боевой базе есть. Повтор вставки без него убран
  // 16.08.2026: абонемент сохранялся без способа оплаты, и в кассе появлялась
  // продажа «оплата не указана», которую потом искали руками.
  const { data: sub, error: subError } = await supabase
    .from("subscriptions")
    .insert(row)
    .select("id")
    .single();
  if (subError) {
    // Абонемент не создался — заявка не должна остаться «проведённой».
    if (bookingId && bookingBefore) await releaseBooking(supabase, bookingId, bookingBefore);
    return { error: `Не удалось создать абонемент: ${subError.message}` };
  }

  // Заявка уже закрыта захватом выше; здесь запоминаем, ЧЕМ она закрыта (0038).
  if (bookingId && sub) {
    await linkBookingResult(supabase, bookingId, { subscription_id: sub.id as string });
  }

  // Клуб пока не запускаем: продажа абонемента НЕ делает клиента членом клуба
  // (как и у инструктора). Членство добавляется руками на вкладке «Члены клуба».

  revalidatePath("/", "layout");
  officeRedirect(user, "/subscriptions");
}

// Тумблер оплаты. Поставить — с датой (по умолчанию сегодня; месяц оплаты
// решает, куда упадут выручка и комиссия). Снять — подтверждение на клиенте:
// отметка уже могла войти в расчёты.
export async function togglePaidAction(formData: FormData) {
  const user = await requireOffice();
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
  const supabase = await officeClient(user);
  // Заявление инструктора «оплату принял админ» (0032) снимаем в обоих случаях:
  // админ на вопрос уже ответил — либо подтвердил оплату, либо снял отметку.
  // Висящая после этого плашка была бы просто мусором на карточке.
  const patch = {
    paid_at: paidAt,
    payment_method_id: paymentMethodId,
    payment_claim: null,
    payment_claim_note: null,
    payment_claim_by: null,
    payment_claim_at: null,
  };
  // Колонки заявления об оплате (0032) в боевой базе есть — повтор запроса без
  // них убран 16.08.2026: он оставлял висеть «инструктор говорит, что оплату
  // принял админ» на уже отмеченном абонементе.
  const { error } = await supabase.from("subscriptions").update(patch).eq("id", id);
  failIfError(error, "не удалось изменить отметку оплаты");
  revalidatePath("/", "layout");
}

// Тумблер «в общий котёл» (0048). Продажа босса (админ, dev, механик) обычно
// остаётся школе, но её можно отдать в котёл: 15% уйдут сменщикам того дня,
// когда абонемент ОПЛАЧЕН, — по тем же правилам, что инструкторская продажа.
// Кнопка нужна для уже внесённых абонементов: без неё пришлось бы удалять
// продажу и заводить заново с галочкой.
//
// На продажах полевого состава кнопки нет: у них котёл считается всегда, и
// флаг там просто не читается (см. lib/salary → getSubsShares).
export async function toggleSubsPoolAction(formData: FormData) {
  const user = await requireOffice();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await officeClient(user);
  const { error } = await supabase
    .from("subscriptions")
    .update({ pool_share: formData.get("set") === "1" })
    .eq("id", id);
  failIfError(error, "не удалось изменить долю котла");
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
  const user = await requireOffice();

  const subId = String(formData.get("subscriptionId") ?? "");
  const duration = Number(formData.get("minutes"));
  // Сколько человек каталось одновременно с ОДНОГО абонемента (см. parseRiders).
  const riders = parseRiders(formData.get("riders"));
  const date = String(formData.get("date") ?? "").trim();
  const instructorId = String(formData.get("instructorId") ?? "");
  // Пометка к прокату — необязательная, уходит в примечание сессии.
  const comment = String(formData.get("comment") ?? "").trim();
  if (!subId || !Number.isSafeInteger(duration) || duration <= 0) {
    return { error: "Минуты — целое число больше нуля." };
  }
  const minutes = duration * riders;
  if (!DAY_RE.test(date)) return { error: "Укажите дату проката." };

  const result = await writeOffSubscription(createAdminClient(), {
    subscriptionId: subId,
    minutes,
    instructorId: instructorId || null,
    actorId: user.id,
    note: writeOffNote(riders, comment),
    date,
  });
  if (result.error !== null) return { error: result.error };

  revalidatePath("/", "layout");
  officeRedirect(user, "/subscriptions");
}

// Корректировки минут (таблица subscription_adjustments) больше не заводятся:
// форма стояла рядом со списанием, читалась как второй способ списать минуты —
// и админ списывал ею, а такие минуты не попадают в «Сессии» (баг №6 пачки №6).
// Читать корректировки мы продолжаем: старые записи входят в остаток и в
// историю абонемента.

// Отмена абонемента (пачка №5, п.13): продажа не состоялась — клиент передумал,
// вернули деньги. В отличие от удаления карточка остаётся: видно, что продажа
// была и чем кончилась, а списания и корректировки никуда не деваются.
//
// Отметку оплаты снимаем: отменённый абонемент не должен висеть в выручке
// месяца и в комиссии продавца. Обратно её ставят руками — старую дату оплаты
// мы не помним и выдумывать её нельзя.
export async function cancelSubscriptionAction(formData: FormData) {
  const user = await requireOffice();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await officeClient(user);

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
  const user = await requireOffice();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await officeClient(user);
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
  const user = await requireOffice();
  const supabase = await officeClient(user);

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
    created_by: user.id,
  });
  if (error) return { error: `Не удалось сохранить выплату: ${error.message}` };

  revalidatePath("/", "layout");
  officeRedirect(user, "/agents");
}

// Ошиблись суммой или датой — выплату можно снести. Отдельного «редактировать»
// не делаем: удалить и внести заново проще и честнее в истории.
export async function deleteAgentPayoutAction(formData: FormData) {
  const user = await requireOffice();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await officeClient(user);
  const { error } = await supabase.from("agent_payouts").delete().eq("id", id);
  failIfError(error, "не удалось удалить выплату");
  revalidatePath("/", "layout");
}

// ── Клиенты (подэтап 4.4) ────────────────────────────────────────────────────
// Правка карточки клиента: имя, телефон, внутренняя заметка. Телефон храним
// цифрами (как resolveClient) — так работает дедуп при следующих оформлениях.
export async function updateClientAction(formData: FormData) {
  const user = await requireOffice();
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
  const supabase = await officeClient(user);
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
  // Фото клиента и так пишется служебным ключом (ниже) — здесь только проверка
  // прав, сам пользователь дальше не нужен.
  await requireOffice();

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Клиент не найден." };

  const photo = formData.get("photo");
  if (!(photo instanceof File) || photo.size === 0) {
    return { error: "Выберите фото." };
  }
  const checked = await checkPhoto(photo);
  if (!checked.ext) {
    return { error: checked.error ?? "Не удалось проверить формат фото." };
  }

  const result = await replacePrivateClientPhoto(id, photo, checked.ext);
  if (result.error) return result;

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
  const author = await requireOffice();
  const supabase = await officeClient(author);

  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  if (!name) return { error: "Укажите имя агента." };
  // Агенту платят комиссию — без телефона его потом не найти (пак 4, п.2).
  if (!isValidPhone(phone)) return { error: PHONE_ERROR };
  // Тариф (0046). Незнакомое значение из формы превращается в стандартный —
  // деньги не должны зависеть от того, что прислал браузер.
  const plan = asAgentPlan(formData.get("termsPlan"));

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
      .insert({ user_id: user.id, ref_code: randomRefCode(), terms_plan: plan });
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
  officeRedirect(author, "/agents");
}

// Выключить/включить агента. Выключенный: лендинг /r/<код> перестаёт принимать
// гостей (мягкий редирект на /training), но история и награды остаются.
export async function toggleAgentActiveAction(formData: FormData) {
  const user = await requireOffice();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await officeClient(user);
  const { error } = await supabase
    .from("agents")
    .update({ active: formData.get("active") !== "1" })
    .eq("id", id);
  failIfError(error, "не удалось переключить агента");
  revalidatePath("/", "layout");
}

// Сменить тариф агента (0046). Условия партнёров начальник меняет живьём —
// «на этом тарифе с сегодня», поэтому выбор стоит прямо в карточке.
//
// ВАЖНО: тариф влияет только на БУДУЩИЕ занятия. Уже записанные сессии хранят
// свою комиссию (sessions.agent_commission), а начисленные награды — свою
// сумму; задним числом мы их не пересчитываем, иначе поехали бы закрытые
// месяцы, ЗП и доля площадки.
export async function setAgentTermsAction(formData: FormData) {
  const user = await requireOffice();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await officeClient(user);
  const { error } = await supabase
    .from("agents")
    .update({ terms_plan: asAgentPlan(formData.get("termsPlan")) })
    .eq("id", id);
  failIfError(error, "не удалось сменить условия агента");
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

// Сделать клиента членом клуба вручную. Продажа абонемента membership сейчас
// не создаёт: это отдельное решение администратора. Публичная страница клуба
// пока описывает другое правило — конфликт зафиксирован в questions.md.
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
  const user = await requireOffice();
  const id = String(formData.get("id") ?? "");
  const date = String(formData.get("newDate") ?? "").trim();
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  await updateBooking(user, id, {
    preferred_date: date,
    scheduled_time: String(formData.get("newTime") ?? "").trim() || null,
    rescheduled_at: new Date().toISOString(),
  });
}

// «Сохранить»: обновить поля уже подтверждённой записи, статус не трогаем.
export async function saveBookingAction(formData: FormData) {
  const user = await requireOffice();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await updateBooking(user, id, bookingFields(formData));
}

// «Закрепить/Открепить»: закреплённые записи висят сверху у инструкторов.
export async function togglePinAction(formData: FormData) {
  const user = await requireOffice();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await updateBooking(user, id, { pinned: formData.get("pinned") !== "1" });
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
  const user = await requireOffice();

  const fields = materialFields(formData);
  if (!fields.label) return { error: "Укажите название канала." };
  if (!SRC_RE.test(fields.src)) {
    return { error: "Метка: 2–30 символов, латиница, цифры, дефис." };
  }

  const supabase = await officeClient(user);
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
  officeRedirect(user, "/materials"); // redirect = чистая форма после успеха
}

export async function updateMaterialAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireOffice();

  const id = String(formData.get("id") ?? "");
  const fields = materialFields(formData);
  if (!id || !fields.label) return { error: "Укажите название канала." };
  if (!SRC_RE.test(fields.src)) {
    return { error: "Метка: 2–30 символов, латиница, цифры, дефис." };
  }

  const supabase = await officeClient(user);
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
  const user = await requireOffice();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await officeClient(user);
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
// закрыл после 18:00, смена закрыта — 200 000 ₫. Но живую смену машина не
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

// Время открытия и закрытия смены руками — только для админа.
//
// Зачем вообще: 27.07.2026 Никита сделал утренние фото, но выход ему не
// засчитался (фото и открытие смены были двумя разными действиями, кнопку он не
// нажал). Человек отработал, а премии за выход нет — и починить это можно было
// только запросом в Supabase. Сам сценарий убран (теперь смену открывает фото),
// но ручка нужна: телефон сел, интернет упал, забыл закрыться.
//
// Механику её НЕ даём (в отличие от снятия премии): он тоже открывает себе
// смену, и правка собственного времени — это ровно то, от чего защищала 0020.
// Пустое поле = стереть отметку.
export async function setShiftTimesAction(formData: FormData) {
  await requireAdmin();
  const instructorId = String(formData.get("instructorId") ?? "");
  const date = String(formData.get("date") ?? "");
  if (!instructorId || !DAY_RE.test(date)) return;

  const opened = String(formData.get("opened") ?? "").trim();
  const closed = String(formData.get("closed") ?? "").trim();
  const openedAt = opened ? vnIsoAt(date, opened) : null;
  const closedAt = closed ? vnIsoAt(date, closed) : null;
  // Мусор в поле не должен молча ОБНУЛИТЬ время — тогда админ, промахнувшись по
  // клавише, стёр бы человеку выход. Ничего не трогаем.
  if ((opened && !openedAt) || (closed && !closedAt)) return;

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("shifts")
    .update({ opened_at: openedAt, closed_at: closedAt })
    .eq("instructor_id", instructorId)
    .eq("date", date);
  failIfError(error, "не удалось изменить время смены");
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

// ── Справочники: категории расходов, форматы оплаты, каналы записи ───────────
// (пачка №4, пак A; каналы добавлены в 0041.) Все таблицы устроены одинаково
// (name + active), поэтому экшены общие, а какой именно справочник править —
// приходит полем формы. Валидируем имя таблицы по белому списку: иначе
// значением из формы можно было бы дотянуться до любой таблицы базы.
const DICT_TABLES: DictTable[] = [
  "expense_categories",
  "payment_methods",
  "booking_channels",
];

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

// Старший инструктор (0033): кто утром осматривает доску и крыло, а кто просто
// отмечается, что пришёл. Пишем service_role — на users нет политики «админ
// правит чужую строку», роль там же, и открывать её на запись мы не хотим
// (см. рассинхрон роли JWT/БД). Колонку role не трогаем вообще.
export async function setSeniorAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const senior = String(formData.get("senior") ?? "") === "true";
  const admin = createAdminClient();
  const { error } = await admin
    .from("users")
    .update({ senior })
    .eq("id", id)
    .eq("role", "instructor");
  failIfError(error, "не удалось изменить старшинство");
  revalidatePath("/", "layout");
}

// ── Выплата зарплаты (0043) ──────────────────────────────────────────────────
//
// Одна форма на всех: выбрал работника, вписал сумму, поставил дату — «Выплачено».
// До 13.08.2026 выплата была кнопкой у строки расчёта и жёстко закрывала период
// («за 3—9 августа выдано столько-то»), причём одни и те же дни нельзя было
// закрыть дважды. Живая касса так не работает: аванс в среду, остаток в
// понедельник, иногда частями — ни один такой платёж в «период» не ложится.
// Теперь выплата это просто «кому, сколько и какого числа», а от двойной выдачи
// защищает не запрет, а видимая на экране разница «начислено − выплачено».
//
// Штат пишем в salary_payouts, агентов — в agent_payouts (0023, там же их
// выплаты показывает вкладка «Агенты»): таблицы разные, потому что агент — не
// сотрудник, у него своя ссылка и свои награды.
//
// Выплата — это и есть расход школы (14.08.2026, решение David). Никаких
// расходов-двойников в expenses больше не заводим: деньги школы считаются по
// живым выдачам, и lib/finance вычитает эту строку из остатка прямо отсюда.
// Раньше выдача «отдельной зарплаты» создавала ещё и расход со ссылкой в
// expense_id — одни и те же деньги в двух таблицах, что и путало.
export async function paySalaryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();

  // «staff:<uuid>» или «agent:<uuid>» — одним полем, чтобы форма осталась
  // одним выпадающим списком, а не двумя связанными.
  const [payeeKind, payeeId] = String(formData.get("payee") ?? "").split(":");
  if ((payeeKind !== "staff" && payeeKind !== "agent") || !payeeId) {
    return { error: "Выберите, кому выплата." };
  }

  const amount = parseVnd(String(formData.get("amount") ?? "").trim());
  if (amount === null || amount <= 0) {
    return { error: "Сумма — число в донгах больше нуля, например 2 000 000." };
  }

  const paidOn = String(formData.get("paidOn") ?? "").trim();
  if (!DAY_RE.test(paidOn)) return { error: "Укажите дату выплаты." };

  const comment = String(formData.get("comment") ?? "").trim() || null;
  const supabase = await createClient();

  if (payeeKind === "agent") {
    const { error } = await supabase.from("agent_payouts").insert({
      agent_id: payeeId,
      amount,
      paid_on: paidOn,
      comment,
      created_by: admin.id,
    });
    if (error) return { error: `Не удалось сохранить выплату: ${error.message}` };
    revalidatePath("/", "layout");
    return { error: null };
  }

  const { error } = await supabase.from("salary_payouts").insert({
    instructor_id: payeeId,
    amount,
    paid_on: paidOn,
    comment,
    paid_at: new Date().toISOString(),
    created_by: admin.id,
  });
  if (error) {
    return { error: `Не удалось сохранить выплату: ${error.message}` };
  }

  revalidatePath("/", "layout");
  return { error: null };
}

// Ошиблись суммой, датой или человеком — выплату можно снести. Отдельного
// «редактировать» не делаем: удалить и внести заново честнее в истории.
// Вместе с выплатой СММщика уходит и заведённый ею расход — иначе снятая
// выплата продолжала бы занижать прибыль.
export async function deleteSalaryPayoutAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const kind = String(formData.get("kind") ?? "");
  if (!id) return;

  const supabase = await createClient();

  if (kind === "agent") {
    const { error } = await supabase.from("agent_payouts").delete().eq("id", id);
    failIfError(error, "не удалось удалить выплату");
    revalidatePath("/", "layout");
    return;
  }

  const { data: payout } = await supabase
    .from("salary_payouts")
    .select("expense_id")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("salary_payouts").delete().eq("id", id);
  failIfError(error, "не удалось удалить выплату");

  const expenseId = payout?.expense_id as string | null | undefined;
  if (expenseId) {
    await supabase.from("expenses").delete().eq("id", expenseId);
  }

  revalidatePath("/", "layout");
}

// Уволить инструктора (0036). Не удаление: строка в users остаётся, вместе с
// ней остаются его занятия, смены и все прошлые расчёты — начальнику нужно
// видеть, что такой человек был и сколько ему выплатили.
//
// left_at — ПОСЛЕДНИЙ оплачиваемый день включительно. В интерфейсе человек
// считается уволенным уже с этой даты (см. lib/staff → isFired), поэтому сразу:
//   • исчезает из списков в формах (кто провёл, кто продал, кому ставить смену),
//   • не участвует в дележе абонементов, оплаченных после его ухода,
//   • не может войти в кабинет (см. lib/auth).
// Заработанное за отработанные дни остаётся в «Расчёте выплат» — по нему и
// платят напоследок.
//
// Пишем service_role по той же причине, что и старшинство: политики «админ
// правит чужую строку users» нет, и открывать эту таблицу на запись мы не
// хотим (роль лежит там же — см. рассинхрон роли JWT/БД).
export async function fireInstructorAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const day = String(formData.get("lastDay") ?? "").trim();
  if (!DAY_RE.test(day)) return;

  const admin = createAdminClient();
  const { error } = await admin
    .from("users")
    .update({ left_at: day })
    .eq("id", id)
    .eq("role", "instructor");
  failIfError(error, "не удалось уволить инструктора");
  revalidatePath("/", "layout");
}

// Вернуть уволенного: снимаем дату. На случай ошибки («не того ткнул») и
// реального возвращения человека после перерыва — вся его история на месте.
export async function rehireInstructorAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const admin = createAdminClient();
  const { error } = await admin
    .from("users")
    .update({ left_at: null })
    .eq("id", id)
    .eq("role", "instructor");
  failIfError(error, "не удалось вернуть инструктора");
  revalidatePath("/", "layout");
}

// Первый рабочий день. Нужен новичкам: доля с абонементов должна идти с даты
// приёма, а не с начала месяца. Пусто = «работал всегда» (так у всех, кто был
// заведён до 0036).
export async function setHiredAtAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const raw = String(formData.get("hiredAt") ?? "").trim();
  if (raw && !DAY_RE.test(raw)) return;

  const admin = createAdminClient();
  const { error } = await admin
    .from("users")
    .update({ hired_at: raw || null })
    .eq("id", id)
    .eq("role", "instructor");
  failIfError(error, "не удалось сохранить дату приёма");
  revalidatePath("/", "layout");
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
