import { createAdminClient } from "@/lib/supabase/admin";
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

// Только полное нормализованное совпадение, с индексом (0056). Две карточки
// с одним номером — неоднозначность, а не повод выбрать первую.
async function findClientByPhone(
  supabase: Admin,
  phone: string,
): Promise<{ id: string; name: string } | null> {
  const { data, error } = await supabase.rpc("find_member_client_by_phone", {
    p_phone: phone,
  });
  failIfReadError(error, "не удалось найти клиента по телефону");

  const hit = data?.length === 1 ? data[0] : null;
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
  const phone = input.phone.trim();
  const client = phone ? await findClientByPhone(supabase, phone) : null;

  const { error: linkError } = await supabase.from("client_telegram").upsert(
    {
      telegram_id: input.telegramId,
      client_id: client?.id ?? null,
      phone,
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

  // client_id — кэш, НЕ доказательство владения. Перепроверяем и старые связи:
  // раньше они могли появиться по совпадению хвоста; телефон карточки также
  // мог измениться, а дубликат — появиться уже после привязки.
  const found = await findClientByPhone(supabase, link.phone as string);
  if (!found) return { state: "no_client", phone: link.phone as string };
  if (link.client_id !== found.id) {
    const { error: updateError } = await supabase
      .from("client_telegram")
      .update({ client_id: found.id, linked_at: new Date().toISOString() })
      .eq("telegram_id", telegramId)
      .eq("phone", link.phone);
    if (updateError) {
      console.error("[member] telegram relink error:", updateError.message);
      throw new Error("не удалось привязать найденного клиента к Telegram");
    }
  }

  return { clientId: found.id, clientName: found.name ?? "Гость" };
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
