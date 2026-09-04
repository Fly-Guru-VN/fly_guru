import { createAdminClient } from "@/lib/supabase/admin";
import { phoneDigits, phonesMatch } from "@/lib/phone";
import { minutesLeft } from "@/lib/subscriptions";
import { failIfReadError } from "@/lib/dbError";

// Кабинет клиента: кто это, сколько у него минут и что у него записано.
//
// Всё здесь работает служебным ключом (service_role). Причина: у клиента нет и
// не будет аккаунта в Supabase — он вошёл через Telegram, а не через логин с
// паролем. Значит RLS его не различает, и решать «что этому человеку можно
// видеть» должен сервер. Правило простое и одно: каждая функция ниже сначала
// находит client_id по проверенному telegram_id и дальше читает ТОЛЬКО строки
// с этим client_id. Никаких «id пришёл с клиента» — иначе, подставив чужой id,
// человек прочитал бы чужой абонемент.

// Заявки, которые для клиента ещё «живые»: их видно в «Моих записях» и их
// можно отменить. done/cancelled/archived — уже история.
export const ACTIVE_BOOKING_STATUSES = ["new", "contacted", "confirmed"] as const;

export interface MemberBooking {
  id: string;
  bookingNo: number | null;
  date: string | null; // 'YYYY-MM-DD'
  time: string | null; // как показываем человеку: '15:00'
  serviceName: string | null;
  status: string;
  note: string | null;
}

export interface MemberVisit {
  date: string;
  minutes: number | null;
  serviceName: string | null;
  note: string | null;
}

export interface MemberBookingRow {
  id: string;
  booking_no: number | null;
  preferred_date: string | null;
  scheduled_time: string | null;
  status: string;
  public_note: string | null;
  services: { name: string } | null;
}

export interface MemberVisitRow {
  date: string;
  minutes_used: number | null;
  public_note: string | null;
  services: { name: string } | null;
}

// Эти преобразования — security boundary: типы намеренно не содержат
// bookings.internal_note и sessions.note, поэтому служебный текст нельзя
// случайно протащить в объект, который получает браузер клиента.
export function toMemberBooking(row: MemberBookingRow): MemberBooking {
  return {
    id: row.id,
    bookingNo: row.booking_no,
    date: row.preferred_date,
    time: row.scheduled_time,
    serviceName: row.services?.name ?? null,
    status: row.status,
    note: row.public_note,
  };
}

export function toMemberVisit(row: MemberVisitRow): MemberVisit {
  return {
    date: row.date,
    minutes: row.minutes_used,
    serviceName: row.services?.name ?? null,
    note: row.public_note,
  };
}

export interface MemberData {
  clientId: string;
  clientName: string;
  // Абонемент. null — активного нет (не купил, кончился или истёк).
  subscription: {
    id: string;
    totalMinutes: number;
    left: number;
    expiresAt: string | null;
  } | null;
  bookings: MemberBooking[];
  history: MemberVisit[];
}

export type MemberState =
  // Телефоном не делился — связи нет вовсе, надо вернуться в бота.
  | { state: "no_phone" }
  // Телефон дал, но карточки клиента с таким номером у нас нет.
  | { state: "no_client"; phone: string }
  | { state: "ok"; data: MemberData };

type Admin = ReturnType<typeof createAdminClient>;

// Найти карточку клиента по номеру телефона.
//
// Почему перебором, а не запросом с like: номера в базе лежат вперемешку —
// заявки с сайта пишут только цифры, а карточки, заведённые руками, хранят
// «+84 90 123 45 67» с пробелами и плюсом. Сравнение по хвосту (phonesMatch)
// умеет и то и другое, а SQL пришлось бы учить чистить строку. Клиентов у
// школы сотни, не миллионы — такой перебор дешевле, чем ошибка «не нашли».
async function findClientByPhone(
  supabase: Admin,
  digits: string,
): Promise<{ id: string; name: string } | null> {
  const { data, error } = await supabase
    .from("clients")
    .select("id, name, phone")
    .not("phone", "is", null)
    .limit(5000);
  failIfReadError(error, "не удалось найти клиента по телефону");

  const hit = (data ?? []).find((c) => phonesMatch(c.phone, digits));
  return hit ? { id: hit.id, name: hit.name } : null;
}

// Запомнить, что этот телеграм-аккаунт — вот этот номер. Вызывается один раз,
// когда человек нажал «Поделиться номером» в боте.
export async function linkTelegramAccount(input: {
  telegramId: number;
  phone: string;
  username?: string | null;
  firstName?: string | null;
}): Promise<{ clientId: string | null; clientName: string | null }> {
  const supabase = createAdminClient();
  const digits = phoneDigits(input.phone);
  const client = digits ? await findClientByPhone(supabase, digits) : null;

  const { error: linkError } = await supabase.from("client_telegram").upsert(
    {
      telegram_id: input.telegramId,
      client_id: client?.id ?? null,
      phone: digits,
      username: input.username ?? null,
      first_name: input.firstName ?? null,
      linked_at: client ? new Date().toISOString() : null,
    },
    { onConflict: "telegram_id" },
  );
  if (linkError) {
    console.error("[member] telegram link upsert error:", linkError.message);
    throw new Error("не удалось сохранить связь Telegram с клиентом");
  }

  return { clientId: client?.id ?? null, clientName: client?.name ?? null };
}

// Найти клиента по проверенному telegram_id. Отдельно от загрузки данных:
// этой же функцией пользуются действия «записаться» и «отменить», и им нужен
// только client_id.
export async function resolveMember(
  supabase: Admin,
  telegramId: number,
): Promise<{ clientId: string; clientName: string } | MemberState> {
  const { data: link, error: linkError } = await supabase
    .from("client_telegram")
    .select("client_id, phone")
    .eq("telegram_id", telegramId)
    .maybeSingle();
  failIfReadError(linkError, "не удалось прочитать связь Telegram с клиентом");

  if (!link) return { state: "no_phone" };

  // Карточки не было в момент, когда человек делился номером, — пробуем ещё
  // раз сейчас. Так гость, записавшийся после знакомства с ботом, получает
  // кабинет сам, без повторного вопроса про телефон.
  let clientId = link.client_id as string | null;
  let clientName: string | null = null;
  if (!clientId) {
    const found = await findClientByPhone(supabase, link.phone as string);
    if (!found) return { state: "no_client", phone: link.phone as string };
    clientId = found.id;
    clientName = found.name;
    const { error: updateError } = await supabase
      .from("client_telegram")
      .update({ client_id: clientId, linked_at: new Date().toISOString() })
      .eq("telegram_id", telegramId);
    if (updateError) {
      console.error("[member] telegram relink error:", updateError.message);
      throw new Error("не удалось привязать найденного клиента к Telegram");
    }
  }

  // Для проверяющего типы: выше clientId уже либо был, либо мы вышли с
  // no_client — эта ветка недостижима, но пусть будет явной, а не «!».
  if (!clientId) return { state: "no_client", phone: link.phone as string };

  if (!clientName) {
    const { data: c, error: clientError } = await supabase
      .from("clients")
      .select("name")
      .eq("id", clientId)
      .maybeSingle();
    failIfReadError(clientError, "не удалось прочитать имя клиента");
    clientName = c?.name ?? "Гость";
  }

  return { clientId, clientName: clientName ?? "Гость" };
}

// Всё, что показывает главный экран кабинета, одним запросом-пачкой.
export async function loadMemberData(telegramId: number): Promise<MemberState> {
  const supabase = createAdminClient();
  const who = await resolveMember(supabase, telegramId);
  if ("state" in who) return who;

  // Абонемент — последний активный. Остаток считаем общей функцией: та же
  // формула, что видят админ и инструктор, чтобы цифры не разошлись.
  const { data: sub, error: subError } = await supabase
    .from("subscriptions")
    .select("id, total_minutes, expires_at")
    .eq("client_id", who.clientId)
    .eq("status", "active")
    .order("sold_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  failIfReadError(subError, "не удалось прочитать абонемент клиента");

  const [left, bookingsRes, historyRes] = await Promise.all([
    sub ? minutesLeft(supabase, sub) : Promise.resolve(0),
    supabase
      .from("bookings")
      .select("id, booking_no, preferred_date, scheduled_time, status, public_note, services(name)")
      .eq("client_id", who.clientId)
      .in("status", ACTIVE_BOOKING_STATUSES as unknown as string[])
      .order("preferred_date", { ascending: true })
      .limit(20),
    supabase
      .from("sessions")
      .select("date, minutes_used, public_note, services(name)")
      .eq("client_id", who.clientId)
      .order("date", { ascending: false })
      .limit(30),
  ]);
  failIfReadError(bookingsRes.error, "не удалось прочитать записи клиента");
  failIfReadError(historyRes.error, "не удалось прочитать историю клиента");

  return {
    state: "ok",
    data: {
      clientId: who.clientId,
      clientName: who.clientName,
      subscription: sub
        ? {
            id: sub.id,
            totalMinutes: sub.total_minutes,
            left,
            expiresAt: sub.expires_at,
          }
        : null,
      bookings: ((bookingsRes.data ?? []) as unknown as MemberBookingRow[]).map(
        toMemberBooking,
      ),
      history: ((historyRes.data ?? []) as unknown as MemberVisitRow[]).map(
        toMemberVisit,
      ),
    },
  };
}
