import type { createClient } from "@/lib/supabase/server";
import {
  SESSION_RATE,
  SHIFT_PAY,
  SUBS_RATE,
  getSessionShare,
  getShiftPay,
  getSubsShares,
  type SessionShare,
  type ShiftPayInfo,
  type ShiftPayRow,
  type SubsShares,
} from "@/lib/salary";
import {
  activeStaff,
  inShiftCrew,
  loadDayShareBosses,
  loadShiftCrew,
  type StaffMember,
} from "@/lib/staff";
import type { AppRole } from "@/lib/auth";
import { failIfReadError } from "@/lib/dbError";

// Общий расчёт статистики инструктора — им пользуются главный экран кабинета
// (цифры за текущий месяц) и экран «Статистика» (произвольный период).
//
// Формула ЗП инструктора — три слагаемых (правила от 2026-07-24, пачка №9):
//   • 15% с сессий дня, ПОДЕЛЁННЫЕ между теми, кто в этот день открыл смену
//     (день без смен — 15% со своих чеков); подробности в lib/salary;
//   • 200 000 ₫ за каждый выход, отработанный по регламенту (открыл до 9:00,
//     закрыл после 18:00, смена закрыта) и не снятый админом вручную;
//   • доля абонементного котла: 15% от абонементов, ПРОДАННЫХ ИНСТРУКТОРАМИ
//     и оплаченных в периоде (paid_at не пуст). Каждый абонемент делится
//     поровну между теми, кто был в штате В ДЕНЬ ЕГО ОПЛАТЫ — неважно, кто
//     именно продал (правка от 08.08.2026, подробности в lib/salary).
// Неоплаченные абонементы в ЗП не входят — показываются отдельной строкой.
//
// Админ — босс, а не наёмный: ЗП у него нет вообще. Со своей сессии он платит
// только Marina Beach (35%) и 2% CRM, остальное оставляет себе (см. lib/finance).
// Поэтому для роли admin все три слагаемых — нули, а его продажи абонементов
// в котёл инструкторов не идут.

// Ставки живут в lib/salary (там же правила дележа), здесь — реэкспорт, чтобы
// не переписывать импорты по всему проекту.
export { SESSION_RATE, SHIFT_PAY, SUBS_RATE };

// Роль того, чью статистику считаем. От неё зависит одно: идут ли человеку
// сменные деньги (см. staff → SHIFT_CREW_ROLES). У босса ЗП нет, у механика
// фикс за месяц — у обоих три слагаемых нули.
export type StaffRole = AppRole;

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Границы периода — форма как у vnCurrentMonth()/vnPeriod() из lib/dates.
export interface StatsRange {
  fromDay: string; // date-колонки: date >= fromDay
  toDay: string; //                 date <  toDay
  fromIso: string; // timestamptz (paid_at): >= fromIso
  toIso: string; //                          <  toIso
}

// Один клиент = один бар на графике: сколько он принёс за период.
export interface ClientBar {
  clientId: string;
  name: string;
  amount: number; // сумма чеков
  sessions: number; // сколько занятий
  minutes: number; // списано минут с абонемента
}

export interface InstructorStats {
  clientsCount: number;
  sessionsCount: number;
  revenue: number; // сумма чеков моих сессий за период
  avgCheck: number; // средний чек по сессиям с деньгами (списания не считаем)
  minutesWrittenOff: number;
  salary: number;
  salaryFromSessions: number; // моя доля 15% после дележа по сменам дня
  salaryFromShifts: number; // 200 000 ₫ × зачтённые выходы
  salaryFromSubs: number; // моя доля котла (не зависит от того, кто продал)
  shiftsCount: number; // выходы, за которые заплатят
  shiftsUnpaidCount: number; // выходы, срезанные регламентом или админом
  shiftsPlannedCount: number; // смены графика, которые ещё не отработаны
  shiftRows: ShiftPayRow[]; // каждый выход с вердиктом — объяснить любой ноль
  sharedDays: number; // дней, где 15% делились со сменщиками
  ownDays: number; // дней без смен — 15% достались мне целиком
  subsPool: number; // весь котёл за период (15% продаж инструкторов) — справка
  instructorsCount: number; // сколько инструкторов в штате сейчас — для подписи
  /**
   * Со скольких абонементов сложилась МОЯ доля котла. Не путать с paidSubsCount:
   * доля капает с каждого абонемента, оплаченного в дни, когда я был в деле, —
   * кто бы его ни продал (просьба начальника от 25.08.2026).
   */
  sharedSubsCount: number;
  paidSubsCount: number; // абонементы, проданные мной и оплаченные в периоде
  unpaidSubsCount: number; // мои неоплаченные (за всё время) — ждут оплату
  unpaidSubsSum: number;
  clientBars: ClientBar[]; // по убыванию суммы
  byCategory: { category: string; amount: number }[]; // выручка по видам услуг
}

interface SessionRow {
  client_id: string | null;
  amount: number | null;
  agent_commission: number | null;
  minutes_used: number | null;
  clients: { name: string } | null;
  services: { category: string } | null;
}

// Части расчёта ЗП, одинаковые для ВСЕХ инструкторов периода: список штата,
// котёл абонементов, выходы и дележ 15%. Каждая из них читает весь период
// целиком, а не «мои» строки, — поэтому считать её отдельно для каждого
// человека незачем.
export interface PayInputs {
  staff: StaffMember[];
  // Начальство, которое делит 15% за дни своих выходов (staff → DAY_SHARE_BOSS_ROLES).
  // В staff его нет и быть не должно: выход и котёл боссу не положены.
  bosses: StaffMember[];
  subsShares: SubsShares;
  shiftPay: Map<string, ShiftPayInfo>;
  sessionShare: Map<string, SessionShare>;
}

// Экран, которому нужна ЗП сразу нескольких человек (/admin/payroll), читает
// эти части ОДИН раз и передаёт готовыми в getInstructorStats. Без этого
// страница выплат делала по семь запросов на каждого инструктора и ещё столько
// же на второй период — при пяти инструкторах семьдесят запросов вместо
// двух десятков.
export async function loadPayInputs(
  supabase: Supabase,
  range: StatsRange,
  payClient: Supabase = supabase,
): Promise<PayInputs> {
  // Весь полевой состав, включая уволенных: их выходы и занятия за отработанные
  // дни считаются как обычно, а в дележе котла участвуют только дни, когда
  // человек был в штате (см. lib/salary → getSubsShares).
  const [staff, bosses] = await Promise.all([
    loadShiftCrew(supabase),
    loadDayShareBosses(supabase),
  ]);
  const crewIds = staff.map((m) => m.id);
  // Начальник идёт ТОЛЬКО в дележ 15%: за выход ему не платят, и котёл
  // абонементов его не касается — поэтому в getShiftPay и getSubsShares его
  // списка нет (решение David от 04.09.2026).
  const bossIds = bosses.map((m) => m.id);

  // Выходы и дележ 15% — через payClient: обе величины считаются по ВСЕМ
  // сменам и сессиям дня, а не только по своим (см. lib/salary).
  const [subsShares, shiftPay, sessionShare] = await Promise.all([
    getSubsShares(supabase, range, staff),
    getShiftPay(payClient, range, crewIds),
    getSessionShare(payClient, range, crewIds, bossIds),
  ]);

  return { staff, bosses, subsShares, shiftPay, sessionShare };
}

/** Три слагаемых ЗП одного инструктора из общих частей — без запросов. */
export function salaryFrom(
  inputs: PayInputs,
  instructorId: string,
): { fromSessions: number; fromShifts: number; fromSubs: number; total: number } {
  const fromSessions = inputs.sessionShare.get(instructorId)?.amount ?? 0;
  const fromShifts = inputs.shiftPay.get(instructorId)?.amount ?? 0;
  const fromSubs = inputs.subsShares.shares.get(instructorId) ?? 0;
  return {
    fromSessions,
    fromShifts,
    fromSubs,
    total: fromSessions + fromShifts + fromSubs,
  };
}

// payClient — клиент для расчёта ЗП. Дележ 15% по дням и чужие смены нужны
// целиком, а инструктору RLS отдаёт только свои сессии: кабинет передаёт сюда
// service-role, админские экраны — обычный клиент (у админа доступ и так есть).
// Наружу инструктору всё равно уходит только его доля, не чужие суммы.
//
// inputs — уже посчитанные общие части (см. loadPayInputs). Не передали —
// считаем их здесь же, как раньше.
export async function getInstructorStats(
  supabase: Supabase,
  instructorId: string,
  range: StatsRange,
  role: StaffRole = "instructor",
  payClient: Supabase = supabase,
  inputs?: PayInputs,
): Promise<InstructorStats> {
  // Мои сессии за период. RLS отдаёт ещё и чужие списания — фильтруем явно.
  const { data, error } = await supabase
    .from("sessions")
    .select(
      "client_id, amount, agent_commission, minutes_used, clients(name), services(category)",
    )
    .eq("instructor_id", instructorId)
    .gte("date", range.fromDay)
    .lt("date", range.toDay);
  failIfReadError(error, "не удалось прочитать сессии инструктора");
  const rows = (data ?? []) as unknown as SessionRow[];

  // Выручка по МОИМ сессиям — это по-прежнему «сколько я накатал», а не база
  // ЗП: с 2026-07-24 15% делятся по сменам дня и считаются в lib/salary
  // (комиссия агента вычитается там же).
  const revenue = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const minutesWrittenOff = rows.reduce((s, r) => s + (r.minutes_used ?? 0), 0);
  const paidSessions = rows.filter((r) => Number(r.amount ?? 0) > 0);

  // Группируем по клиенту — для баров «каждый клиент отдельно».
  const byClient = new Map<string, ClientBar>();
  for (const r of rows) {
    if (!r.client_id) continue;
    const bar = byClient.get(r.client_id) ?? {
      clientId: r.client_id,
      name: r.clients?.name ?? "Без имени",
      amount: 0,
      sessions: 0,
      minutes: 0,
    };
    bar.amount += Number(r.amount ?? 0);
    bar.sessions += 1;
    bar.minutes += r.minutes_used ?? 0;
    byClient.set(r.client_id, bar);
  }
  const clientBars = [...byClient.values()].sort((a, b) => b.amount - a.amount);

  // Выручка по категориям услуг. У списаний service_id пуст — это «абонемент».
  const byCategoryMap = new Map<string, number>();
  for (const r of rows) {
    const amount = Number(r.amount ?? 0);
    if (amount <= 0) continue;
    const cat = r.services?.category ?? "other";
    byCategoryMap.set(cat, (byCategoryMap.get(cat) ?? 0) + amount);
  }
  const byCategory = [...byCategoryMap.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  const [{ data: subs }, pay] = await Promise.all([
    // Проданные мной — для справки «продал N» и строки «ждут оплату».
    supabase.from("subscriptions").select("price, paid_at").eq("sold_by", instructorId),
    inputs ?? loadPayInputs(supabase, range, payClient),
  ]);
  const { staff, subsShares, shiftPay, sessionShare } = pay;

  const myShifts = shiftPay.get(instructorId) ?? {
    paidCount: 0,
    unpaidCount: 0,
    plannedCount: 0,
    amount: 0,
    rows: [],
  };
  const myShare = sessionShare.get(instructorId) ?? {
    amount: 0,
    sharedDays: 0,
    ownDays: 0,
  };

  const subRows = subs ?? [];
  const paidInRange = subRows.filter(
    (s) => s.paid_at && s.paid_at >= range.fromIso && s.paid_at < range.toIso,
  );
  const unpaid = subRows.filter((s) => !s.paid_at);

  const subsPool = subsShares.pool;

  // Сменные деньги идут полевому составу: инструктору и СММщику, вышедшему на
  // пляж. У босса и механика все три слагаемых — нули.
  const isCrew = inShiftCrew(role);
  // Моя доля 15% за период. Считает lib/salary: база дня делится между теми,
  // кто открыл смену, в дни без смен остаётся тому, кто записал.
  const salaryFromSessions = isCrew ? myShare.amount : 0;
  const salaryFromShifts = isCrew ? myShifts.amount : 0;
  // Доля котла — сумма долей по каждому абонементу: она зависит от того, кто был
  // в штате в день его оплаты, а не от простого деления на «сколько нас сейчас».
  const salaryFromSubs = isCrew ? (subsShares.shares.get(instructorId) ?? 0) : 0;

  return {
    clientsCount: byClient.size,
    sessionsCount: rows.length,
    revenue,
    avgCheck: paidSessions.length ? revenue / paidSessions.length : 0,
    minutesWrittenOff,
    salary: salaryFromSessions + salaryFromShifts + salaryFromSubs,
    salaryFromSessions,
    salaryFromShifts,
    salaryFromSubs,
    shiftsCount: myShifts.paidCount,
    shiftsUnpaidCount: myShifts.unpaidCount,
    shiftsPlannedCount: myShifts.plannedCount,
    shiftRows: myShifts.rows,
    sharedDays: myShare.sharedDays,
    ownDays: myShare.ownDays,
    subsPool,
    // «Котёл делится на N» — справка в кабинете. Считаем только действующих
    // инструкторов: СММщик берёт долю лишь за дни своих смен, ставить его в
    // знаменатель каждый день значило бы занижать чужую долю на экране.
    instructorsCount: activeStaff(staff).filter((m) => m.role === "instructor").length,
    sharedSubsCount: isCrew ? (subsShares.sharedCount.get(instructorId) ?? 0) : 0,
    paidSubsCount: paidInRange.length,
    unpaidSubsCount: unpaid.length,
    unpaidSubsSum: unpaid.reduce((s, r) => s + Number(r.price ?? 0), 0),
    clientBars,
    byCategory,
  };
}

// Форматирование донгов: «1 500 000 ₫».
export function vnd(n: number): string {
  return `${Math.round(n).toLocaleString("ru-RU")} ₫`;
}
