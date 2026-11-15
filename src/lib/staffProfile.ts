import type { createClient } from "@/lib/supabase/server";
import { failIfReadError } from "@/lib/dbError";
import { vnToday } from "@/lib/dates";
import { isFired, type StaffMember } from "@/lib/staff";

// Профиль сотрудника во «Выплате зарплаты» (15.11.2026, проект передаётся
// начальнику). Деньги считает lib/payroll, здесь только то, что про человека:
// стаж, сколько смен и часов он отработал, сколько занятий провёл.
//
// Смены, часы и занятия считаем с той же точки, что и деньги (PAYROLL_EPOCH):
// иначе рядом стояли бы «заработал с 1 августа» и «смен за всё время», и
// начальник делил бы одно на другое.

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface ProfileStats {
  sessions: number; // занятий провёл
  shifts: number; // смен открыл
  hours: number; // часов на закрытых сменах (от открытия до закрытия)
  /** С какого дня человек в команде: дата приёма или первая смена. */
  since: string | null;
}

// Смена длиннее суток — забытое закрытие, а не работа: в часы не берём.
const MAX_SHIFT_MS = 24 * 60 * 60 * 1000;

export function shiftHours(
  shifts: { opened_at: string | null; closed_at: string | null }[],
): number {
  let ms = 0;
  for (const s of shifts) {
    if (!s.opened_at || !s.closed_at) continue;
    const d = Date.parse(s.closed_at) - Date.parse(s.opened_at);
    if (d > 0 && d < MAX_SHIFT_MS) ms += d;
  }
  return ms / 3_600_000;
}

export async function getProfileStats(
  supabase: Supabase,
  member: StaffMember,
  fromDay: string,
): Promise<ProfileStats> {
  const today = vnToday();
  const [sessionsRes, shiftsRes, firstRes] = await Promise.all([
    supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("instructor_id", member.id)
      .gte("date", fromDay)
      .lte("date", today),
    supabase
      .from("shifts")
      .select("opened_at, closed_at")
      .eq("instructor_id", member.id)
      .not("opened_at", "is", null)
      .gte("date", fromDay)
      .lte("date", today),
    member.hiredAt
      ? Promise.resolve({ data: null, error: null })
      : supabase
          .from("shifts")
          .select("date")
          .eq("instructor_id", member.id)
          .not("opened_at", "is", null)
          .order("date")
          .limit(1),
  ]);
  failIfReadError(sessionsRes.error, "не удалось посчитать занятия сотрудника");
  failIfReadError(shiftsRes.error, "не удалось прочитать смены сотрудника");
  failIfReadError(firstRes.error, "не удалось найти первую смену сотрудника");

  const shifts = (shiftsRes.data ?? []) as {
    opened_at: string | null;
    closed_at: string | null;
  }[];
  const first = (firstRes.data as { date: string }[] | null)?.[0]?.date ?? null;

  return {
    sessions: sessionsRes.count ?? 0,
    shifts: shifts.length,
    hours: shiftHours(shifts),
    since: member.hiredAt ?? first,
  };
}

// «2 мес.», «1 г. 3 мес.», «12 дн.». До — последний рабочий день уволенного
// или сегодня.
export function tenureLabel(since: string, until: string): string {
  const [y1, m1, d1] = since.split("-").map(Number);
  const [y2, m2, d2] = until.split("-").map(Number);
  let months = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  if (months < 1) {
    const days =
      Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000) + 1;
    return `${Math.max(1, days)} дн.`;
  }
  const years = Math.floor(months / 12);
  months -= years * 12;
  if (years === 0) return `${months} мес.`;
  return months === 0 ? `${years} г.` : `${years} г. ${months} мес.`;
}

export function tenureUntil(member: StaffMember, today: string = vnToday()): string {
  return isFired(member, today) && member.leftAt ? member.leftAt : today;
}
