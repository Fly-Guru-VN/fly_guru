import type { createClient } from "@/lib/supabase/server";
import type { StatsRange } from "@/lib/stats";
import { closeStatus, openStatus } from "@/lib/shiftRules";

// Как школа платит инструкторам (пачка правок №9, пак 2 — новые правила от
// 2026-07-24). Три слагаемых, два из них поменялись:
//
//  • 300 000 ₫ за выход (было 200 000) — но ТОЛЬКО за смену, отработанную по
//    регламенту: закрыта, открыта до 9:00, закрыта после 18:00. Нарушил —
//    за этот выход ноль. Плюс админ может снять премию руками (bonus_cancelled)
//    с причиной: регламент живой — шторм, поломка, подмена.
//  • 15% с сессий делятся НА СМЕНУ ДНЯ: считаем базу дня по всем сессиям
//    инструкторов и раскладываем её поровну между теми, у кого в этот день
//    стоит смена. Раньше каждый получал 15% со своих чеков — и тот, кто в паре
//    оформлял записи на себя, забирал долю напарника.
//  • доля абонементного котла — без изменений (см. lib/stats).
//
// Дни без смен: 15% уходит тому, кто записал. Так расчёт не теряет деньги, если
// админ не проставил смены в календаре (а он их ставит не всегда).
// Сессии, проведённые самим админом, в дележ не идут вообще — он босс, его чек
// не наполняет ЗП инструкторов (та же логика, что в lib/finance).
//
// ВАЖНО про доступ: инструктор по RLS видит только СВОИ сессии, а дележ дня
// требует чужие. Поэтому функции принимают клиента параметром: админские
// экраны передают обычный (у админа RLS отдаёт всё), кабинет инструктора —
// service-role. Наружу инструктору уходит только его собственная доля.

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const SESSION_RATE = 0.15; // доля инструкторов с чеков занятий
export const SUBS_RATE = 0.15; // доля с абонемента — в общий котёл инструкторов
export const SHIFT_PAY = 300_000; // ₫ за выход, отработанный по регламенту

// Почему за выход не заплатили. «paid» — заплатили.
export type ShiftPayStatus =
  | "paid"
  | "notClosed"
  | "lateOpen"
  | "earlyClose"
  | "cancelled";

export const SHIFT_PAY_LABEL: Record<ShiftPayStatus, string> = {
  paid: "зачтён",
  notClosed: "смена не закрыта",
  lateOpen: "открыл после 9:00",
  earlyClose: "закрыл до 18:00",
  cancelled: "премию снял админ",
};

export interface ShiftPayRow {
  date: string;
  status: ShiftPayStatus;
  comment: string | null; // причина, если премию снял админ
}

// Порядок проверок = порядок объяснения человеку: сначала «а смена вообще
// закрыта?», потом время, и лишь потом решение админа — оно перебивает всё.
export function shiftPayStatus(
  openedAt: string | null,
  closedAt: string | null,
  bonusCancelled: boolean,
): ShiftPayStatus {
  if (bonusCancelled) return "cancelled";
  if (!closedAt) return "notClosed";
  if (openStatus(openedAt) !== "onTime") return "lateOpen";
  if (closeStatus(closedAt) !== "ok") return "earlyClose";
  return "paid";
}

interface ShiftRow {
  date: string;
  instructor_id: string;
  opened_at: string | null;
  closed_at: string | null;
  bonus_cancelled?: boolean | null;
  bonus_comment?: string | null;
}

// Смены периода. Колонки премии появились в 0027, а деплой у David едет
// раньше наката миграции — поэтому при «нет такой колонки» перечитываем без
// них (та же страховка, что у payment_method_id абонемента в 0025).
async function loadShifts(
  client: Supabase,
  range: StatsRange,
): Promise<ShiftRow[]> {
  const base = "date, instructor_id, opened_at, closed_at";
  const withBonus = `${base}, bonus_cancelled, bonus_comment`;

  const query = (columns: string) =>
    client
      .from("shifts")
      .select(columns)
      .gte("date", range.fromDay)
      .lt("date", range.toDay);

  const { data, error } = await query(withBonus);
  if (!error) return (data ?? []) as unknown as ShiftRow[];

  const { data: plain, error: plainError } = await query(base);
  if (plainError) {
    console.error("[salary] shifts load error:", plainError.message);
    return [];
  }
  return (plain ?? []) as unknown as ShiftRow[];
}

export interface ShiftPayInfo {
  paidCount: number; // выходы, за которые платим
  unpaidCount: number; // выходы, которые регламент срезал
  amount: number; // paidCount × SHIFT_PAY
  rows: ShiftPayRow[]; // по датам, по возрастанию — чтобы объяснить каждый ноль
}

// Выходы за период по каждому инструктору: сколько зачтено, сколько нет и
// почему. Строки чужих людей вызывающий отфильтрует сам (кабинету инструктора
// нужна только своя).
export async function getShiftPay(
  client: Supabase,
  range: StatsRange,
  instructorIds: string[],
): Promise<Map<string, ShiftPayInfo>> {
  const shifts = await loadShifts(client, range);
  const allowed = new Set(instructorIds);

  const byInstructor = new Map<string, ShiftPayInfo>();
  const info = (id: string): ShiftPayInfo => {
    let entry = byInstructor.get(id);
    if (!entry) {
      entry = { paidCount: 0, unpaidCount: 0, amount: 0, rows: [] };
      byInstructor.set(id, entry);
    }
    return entry;
  };

  for (const s of shifts) {
    // Смена админа — не выход наёмного работника, платить за неё некому.
    if (!allowed.has(s.instructor_id)) continue;
    const status = shiftPayStatus(
      s.opened_at,
      s.closed_at,
      Boolean(s.bonus_cancelled),
    );
    const entry = info(s.instructor_id);
    entry.rows.push({
      date: s.date,
      status,
      comment: s.bonus_comment ?? null,
    });
    if (status === "paid") {
      entry.paidCount += 1;
      entry.amount += SHIFT_PAY;
    } else {
      entry.unpaidCount += 1;
    }
  }

  for (const entry of byInstructor.values()) {
    entry.rows.sort((a, b) => a.date.localeCompare(b.date));
  }
  return byInstructor;
}

export interface SessionShare {
  amount: number; // 15%, доставшиеся этому инструктору за период
  sharedDays: number; // дни, где сумма делилась со сменщиками
  ownDays: number; // дни без смен — 15% со своих чеков
}

interface SessionRow {
  date: string;
  amount: number | null;
  agent_commission: number | null;
  instructor_id: string | null;
}

// Дележ 15% по дням. Возвращаем карту «инструктор → его доля за период».
//
// База дня — чеки сессий инструкторов минус комиссии агентов по ним (агент
// забирает свои 300к сверху, инструктору с них ничего не идёт). Дальше:
//   • есть смены в этот день → база × 15% делится поровну между сменщиками,
//     даже если сессию оформил кто-то другой (в этом и смысл: работали вдвоём);
//   • смен нет → каждый получает 15% со своих чеков этого дня.
export async function getSessionShare(
  client: Supabase,
  range: StatsRange,
  instructorIds: string[],
): Promise<Map<string, SessionShare>> {
  const [sessionsRes, shifts] = await Promise.all([
    client
      .from("sessions")
      .select("date, amount, agent_commission, instructor_id")
      .gte("date", range.fromDay)
      .lt("date", range.toDay),
    loadShifts(client, range),
  ]);

  const allowed = new Set(instructorIds);
  const sessions = (sessionsRes.data ?? []) as unknown as SessionRow[];

  // День → база (только сессии инструкторов) и вклад каждого в этот день.
  const dayBase = new Map<string, number>();
  const dayOwn = new Map<string, Map<string, number>>();
  for (const s of sessions) {
    const id = s.instructor_id;
    if (!id || !allowed.has(id)) continue;
    const net = Math.max(
      0,
      Number(s.amount ?? 0) - Number(s.agent_commission ?? 0),
    );
    if (net === 0) continue; // списание минут: чека нет, делить нечего
    dayBase.set(s.date, (dayBase.get(s.date) ?? 0) + net);
    let own = dayOwn.get(s.date);
    if (!own) {
      own = new Map();
      dayOwn.set(s.date, own);
    }
    own.set(id, (own.get(id) ?? 0) + net);
  }

  // День → кто на смене (дубли гасим: у одного человека день = одна смена).
  const dayShift = new Map<string, Set<string>>();
  for (const s of shifts) {
    if (!allowed.has(s.instructor_id)) continue;
    const set = dayShift.get(s.date) ?? new Set<string>();
    set.add(s.instructor_id);
    dayShift.set(s.date, set);
  }

  const result = new Map<string, SessionShare>();
  const share = (id: string): SessionShare => {
    let entry = result.get(id);
    if (!entry) {
      entry = { amount: 0, sharedDays: 0, ownDays: 0 };
      result.set(id, entry);
    }
    return entry;
  };

  for (const [date, base] of dayBase) {
    const crew = dayShift.get(date);
    const pay = base * SESSION_RATE;
    if (crew && crew.size > 0) {
      const each = pay / crew.size;
      for (const id of crew) {
        const entry = share(id);
        entry.amount += each;
        entry.sharedDays += 1;
      }
    } else {
      for (const [id, net] of dayOwn.get(date) ?? []) {
        const entry = share(id);
        entry.amount += net * SESSION_RATE;
        entry.ownDays += 1;
      }
    }
  }

  return result;
}
