import type { createClient } from "@/lib/supabase/server";
import type { StatsRange } from "@/lib/stats";
import { vnDay, vnToday } from "@/lib/dates";
import { closeStatus, openStatus } from "@/lib/shiftRules";
import { staffOn, type StaffMember } from "@/lib/staff";

// Как школа платит инструкторам (пачка правок №9, пак 2 — новые правила от
// 2026-07-24). Три слагаемых, два из них поменялись:
//
//  • 200 000 ₫ за выход — но ТОЛЬКО за смену, отработанную по
//    регламенту: закрыта, открыта до 9:00, закрыта после 18:00. Нарушил —
//    за этот выход ноль. Плюс админ может снять премию руками (bonus_cancelled)
//    с причиной: регламент живой — шторм, поломка, подмена.
//    Ставка ходила туда-сюда: 200 000 → 300 000 (пачка №9) → снова 200 000
//    (пачка №15, решение David от 01.08.2026). Цифра живёт в SHIFT_PAY одной
//    строкой — экраны и расчёты берут её оттуда, руками нигде не продублирована.
//  • 15% с сессий делятся НА СМЕНУ ДНЯ: считаем базу дня по всем сессиям
//    инструкторов и раскладываем её поровну между теми, кто в этот день
//    ФАКТИЧЕСКИ вышел. Раньше каждый получал 15% со своих чеков — и тот, кто в
//    паре оформлял записи на себя, забирал долю напарника.
//  • доля абонементного котла — с 08.08.2026 делится ПО ДАТЕ ОПЛАТЫ каждого
//    абонемента, а не по всему периоду сразу (см. getSubsShares ниже).
//
// Кто «на смене» для дележа (правка от 28.07.2026). Раньше считалась любая
// строка shifts — то есть назначенная админом смена давала долю, даже если
// человек не вышел. Теперь порядок такой:
//   1. кто ОТКРЫЛ смену (opened_at заполнен) — назначал её админ или инструктор
//      открыл её сам, не важно: выход открывает фото на пляже, и строка смены
//      заводится на лету с planned=false (см. instructor/actions ensureTodayShift);
//   2. никто не открылся, но смены назначены — делим между назначенными
//      (страховка: человек вышел, а нажать/сфоткаться забыл);
//   3. смен в этот день нет вовсе — 15% уходят тому, кто записал. Так расчёт не
//      теряет деньги, если админ не проставил смены в календаре.
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
export const SHIFT_PAY = 200_000; // ₫ за выход, отработанный по регламенту

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
  plannedCount: number; // смены из графика, которые ещё не отработаны
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
  const today = vnToday();

  const byInstructor = new Map<string, ShiftPayInfo>();
  const info = (id: string): ShiftPayInfo => {
    let entry = byInstructor.get(id);
    if (!entry) {
      entry = { paidCount: 0, unpaidCount: 0, plannedCount: 0, amount: 0, rows: [] };
      byInstructor.set(id, entry);
    }
    return entry;
  };

  for (const s of shifts) {
    // Смена админа — не выход наёмного работника, платить за неё некому.
    if (!allowed.has(s.instructor_id)) continue;
    // Смена, которая ещё не отработана (сегодняшняя незакрытая или из будущего
    // графика), — это не «срезанный регламентом выход», а просто не наступивший
    // день. Раньше такие строки шли в unpaidCount, и 8 августа расчёт месяца
    // писал «Выходы (4) · не зачтено 12» — то есть весь остаток графика висел
    // как нарушение. Закрытую смену судим по регламенту в любом случае: закрыть
    // задним числом можно, а вот открыть завтрашний день — нет.
    if (!s.closed_at && s.date >= today) {
      info(s.instructor_id).plannedCount += 1;
      continue;
    }
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

// Кто делит 15% за конкретный день: сначала открывшие смену, если таких нет —
// назначенные. Пустой набор = смен в этот день не было вообще.
function dayCrew(
  opened: Set<string> | undefined,
  planned: Set<string> | undefined,
): Set<string> | null {
  if (opened && opened.size > 0) return opened;
  if (planned && planned.size > 0) return planned;
  return null;
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
//   • кто-то открыл смену → база × 15% делится поровну между открывшими,
//     даже если сессию оформил кто-то другой (в этом и смысл: работали вдвоём);
//   • никто не открылся, но смены назначены → делим между назначенными;
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

  // День → кто фактически открыл смену и кому она просто назначена (дубли
  // гасим: у одного человека день = одна смена).
  const dayOpened = new Map<string, Set<string>>();
  const dayPlanned = new Map<string, Set<string>>();
  for (const s of shifts) {
    if (!allowed.has(s.instructor_id)) continue;
    const target = s.opened_at ? dayOpened : dayPlanned;
    const set = target.get(s.date) ?? new Set<string>();
    set.add(s.instructor_id);
    target.set(s.date, set);
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
    const crew = dayCrew(dayOpened.get(date), dayPlanned.get(date));
    const pay = base * SESSION_RATE;
    if (crew) {
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

// ── ЗП СММщика (prompt 11, п.3; решение David от 12.08.2026) ─────────────────
//
// Считается не как у инструкторов: смен и занятий у него нет, есть фикс —
// 2 000 000 ₫ за неделю работы. Платим ТОЛЬКО за ПОЛНЫЕ недели выбранного
// периода: «Эта неделя» = 2 млн, месяц из 31 дня = четыре недели, а три
// оставшихся дня в расчёт не идут (выбор David — дробить неделю на дни по
// 285 714 ₫ он не захотел: такую цифру нельзя проверить в уме). Экран
// показывает остаток отдельной подписью, чтобы это не читалось как недостача.
//
// Второе слагаемое, 1% с выручки, здесь НЕ считается вовсе: он уже живёт в
// lib/finance как половина CRM_RATE («Ромчик (СММ)») и закрывается помесячно.
// Начислить его ещё раз значило бы задвоить расход школы.
export const SMM_WEEK_PAY = 2_000_000; // ₫ за неделю работы СММщика

export interface SmmFixedPay {
  weeks: number; // полных недель в периоде
  spareDays: number; // дни-остаток: отработаны, но до недели не добрали
  amount: number; // weeks × SMM_WEEK_PAY
}

// Сколько дней периода человек реально был в штате. Обе границы включительно,
// приём и увольнение обрезают период с краёв (даты из 0036).
function workedDays(from: string, to: string, m?: StaffMember): number {
  const start = m?.hiredAt && m.hiredAt > from ? m.hiredAt : from;
  const end = m?.leftAt && m.leftAt < to ? m.leftAt : to;
  if (end < start) return 0;
  const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

export function getSmmFixedPay(
  fromDay: string,
  lastDay: string,
  member?: StaffMember,
): SmmFixedPay {
  const days = workedDays(fromDay, lastDay, member);
  const weeks = Math.floor(days / 7);
  return { weeks, spareDays: days - weeks * 7, amount: weeks * SMM_WEEK_PAY };
}

// Подпись расхода, который заводит выплата СММщику (см. admin/actions →
// paySalaryAction). Она только для человека, читающего «Расходы»: обратно
// расход находится не по тексту, а по прямой ссылке из выплаты (0043,
// salary_payouts.expense_id) — подпись можно спокойно править руками, и связь
// от этого не порвётся.
export function smmPayoutComment(name: string, paidOn: string): string {
  const day = new Date(`${paidOn}T00:00:00Z`).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return `ЗП СММ · ${name} · выплата ${day}`;
}

export interface SubsShares {
  pool: number; // весь котёл периода: 15% с абонементов инструкторов
  shares: Map<string, number>; // инструктор → его доля
  soldCount: Map<string, number>; // инструктор → сколько продал сам (справка)
}

interface PoolSubRow {
  price: number | null;
  paid_at: string | null;
  sold_by: string | null;
}

// Котёл абонементов: 15% с каждого абонемента, ПРОДАННОГО инструктором и
// оплаченного в периоде. Абонемент админа в котёл не идёт — он босс, его
// продажа остаётся ему (та же логика, что с сессиями в lib/finance).
//
// Дележ (правка от 08.08.2026, пачка №25). Раньше котёл складывался за весь
// период и делился поровну между всеми, кто числится инструктором СЕЙЧАС. Из-за
// этого:
//   • уволенный в середине недели получал долю с абонементов, оплаченных уже
//     после его ухода — а стоило его удалить, он терял и заслуженную часть;
//   • принятый в середине месяца, наоборот, получал долю за дни, когда его в
//     школе ещё не было.
// Теперь каждый абонемент делится отдельно — между теми, кто был в штате В ДЕНЬ
// ЕГО ОПЛАТЫ (lib/staff → worksOn). Живой пример: четверо, Михаила уволили 5-го.
// Абонемент, оплаченный до 5-го, делится на четверых (по 225 000 ₫), следующий —
// на троих (по 300 000 ₫). Ровно так, как просил начальник, и без ручных правок.
//
// staff — ВЕСЬ список инструкторов, включая уволенных: их надо учитывать в
// расчётах за прошлые периоды. Кто в доле за конкретный день, решают даты.
export async function getSubsShares(
  client: Supabase,
  range: StatsRange,
  staff: StaffMember[],
): Promise<SubsShares> {
  const { data } = await client
    .from("subscriptions")
    .select("price, paid_at, sold_by")
    .not("paid_at", "is", null)
    .gte("paid_at", range.fromIso)
    .lt("paid_at", range.toIso);

  const byId = new Map(staff.map((m) => [m.id, m]));
  const shares = new Map<string, number>();
  const soldCount = new Map<string, number>();
  let pool = 0;

  const add = (id: string, amount: number) =>
    shares.set(id, (shares.get(id) ?? 0) + amount);

  for (const raw of (data ?? []) as unknown as PoolSubRow[]) {
    const seller = raw.sold_by;
    // Продажа админа или неизвестно чья — мимо котла.
    if (!seller || !byId.has(seller) || !raw.paid_at) continue;

    soldCount.set(seller, (soldCount.get(seller) ?? 0) + 1);
    const cut = Number(raw.price ?? 0) * SUBS_RATE;
    if (cut <= 0) continue;
    pool += cut;

    // День оплаты по вьетнамскому времени: paid_at — timestamptz, а «в штате
    // 5-го» считается по местному календарю, а не по UTC.
    const day = vnDay(raw.paid_at);
    const crew = staffOn(staff, day);
    if (crew.length === 0) {
      // Такого быть не должно (продавец сам был в штате в день продажи), но
      // если даты выставили криво — деньги не растворяются, а остаются продавцу.
      add(seller, cut);
      continue;
    }
    const each = cut / crew.length;
    for (const m of crew) add(m.id, each);
  }

  return { pool, shares, soldCount };
}
