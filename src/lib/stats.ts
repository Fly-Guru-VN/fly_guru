import type { createClient } from "@/lib/supabase/server";
import {
  SESSION_RATE,
  SHIFT_PAY,
  SUBS_RATE,
  getSessionShare,
  getShiftPay,
  type ShiftPayRow,
} from "@/lib/salary";

// Общий расчёт статистики инструктора — им пользуются главный экран кабинета
// (цифры за текущий месяц) и экран «Статистика» (произвольный период).
//
// Формула ЗП инструктора — три слагаемых (правила от 2026-07-24, пачка №9):
//   • 15% с сессий дня, ПОДЕЛЁННЫЕ между теми, кто в этот день открыл смену
//     (день без смен — 15% со своих чеков); подробности в lib/salary;
//   • 300 000 ₫ за каждый выход, отработанный по регламенту (открыл до 9:00,
//     закрыл после 18:00, смена закрыта) и не снятый админом вручную;
//   • доля абонементного котла: 15% от абонементов, ПРОДАННЫХ ИНСТРУКТОРАМИ
//     и оплаченных в периоде (paid_at не пуст), поделённые ПОРОВНУ между
//     всеми инструкторами — неважно, кто именно продал.
// Неоплаченные абонементы в ЗП не входят — показываются отдельной строкой.
//
// Админ — босс, а не наёмный: ЗП у него нет вообще. Со своей сессии он платит
// только Marina Beach (35%) и 2% CRM, остальное оставляет себе (см. lib/finance).
// Поэтому для роли admin все три слагаемых — нули, а его продажи абонементов
// в котёл инструкторов не идут.

// Ставки живут в lib/salary (там же правила дележа), здесь — реэкспорт, чтобы
// не переписывать импорты по всему проекту.
export { SESSION_RATE, SHIFT_PAY, SUBS_RATE };

export type StaffRole = "instructor" | "admin";

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
  salaryFromShifts: number; // 300 000 ₫ × зачтённые выходы
  salaryFromSubs: number; // моя доля котла (не зависит от того, кто продал)
  shiftsCount: number; // выходы, за которые заплатят
  shiftsUnpaidCount: number; // выходы, срезанные регламентом или админом
  shiftRows: ShiftPayRow[]; // каждый выход с вердиктом — объяснить любой ноль
  sharedDays: number; // дней, где 15% делились со сменщиками
  ownDays: number; // дней без смен — 15% достались мне целиком
  subsPool: number; // весь котёл за период (15% продаж инструкторов) — справка
  instructorsCount: number; // на скольких делится котёл
  paidSubsCount: number; // абонементы, проданные мной и оплаченные в периоде
  unpaidSubsCount: number; // мои неоплаченные (за всё время) — ждут оплату
  unpaidSubsSum: number;
  clientBars: ClientBar[]; // по убыванию суммы
  byCategory: { category: string; amount: number }[]; // выручка по видам услуг
}

// Кто в доле: все с ролью instructor. Флага «активен» у users нет — уволенного
// инструктора админ удаляет из базы, иначе он продолжит делить котёл.
// Инструктору этот список отдаёт политика users_select_staff (миграция 0015).
export async function getInstructorIds(supabase: Supabase): Promise<string[]> {
  const { data } = await supabase.from("users").select("id").eq("role", "instructor");
  return (data ?? []).map((u) => u.id as string);
}

interface SessionRow {
  client_id: string | null;
  amount: number | null;
  agent_commission: number | null;
  minutes_used: number | null;
  clients: { name: string } | null;
  services: { category: string } | null;
}

// payClient — клиент для расчёта ЗП. Дележ 15% по дням и чужие смены нужны
// целиком, а инструктору RLS отдаёт только свои сессии: кабинет передаёт сюда
// service-role, админские экраны — обычный клиент (у админа доступ и так есть).
// Наружу инструктору всё равно уходит только его доля, не чужие суммы.
export async function getInstructorStats(
  supabase: Supabase,
  instructorId: string,
  range: StatsRange,
  role: StaffRole = "instructor",
  payClient: Supabase = supabase,
): Promise<InstructorStats> {
  // Мои сессии за период. RLS отдаёт ещё и чужие списания — фильтруем явно.
  const { data } = await supabase
    .from("sessions")
    .select(
      "client_id, amount, agent_commission, minutes_used, clients(name), services(category)",
    )
    .eq("instructor_id", instructorId)
    .gte("date", range.fromDay)
    .lt("date", range.toDay);
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

  const [{ data: subs }, { data: poolSubs }, instructorIds] = await Promise.all([
    // Проданные мной — для справки «продал N» и строки «ждут оплату».
    supabase.from("subscriptions").select("price, paid_at").eq("sold_by", instructorId),
    // Котёл: всё, что оплатили в периоде (чьё именно — отсеем ниже по sold_by).
    supabase
      .from("subscriptions")
      .select("price, sold_by")
      .not("paid_at", "is", null)
      .gte("paid_at", range.fromIso)
      .lt("paid_at", range.toIso),
    getInstructorIds(supabase),
  ]);

  // Выходы и дележ 15% — через payClient: обе величины считаются по ВСЕМ
  // сменам и сессиям дня, а не только по моим (см. lib/salary).
  const [shiftPay, sessionShare] = await Promise.all([
    getShiftPay(payClient, range, instructorIds),
    getSessionShare(payClient, range, instructorIds),
  ]);
  const myShifts = shiftPay.get(instructorId) ?? {
    paidCount: 0,
    unpaidCount: 0,
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

  // Котёл наполняют ТОЛЬКО продажи инструкторов: абонемент, проданный админом,
  // остаётся боссу — инструкторам с него ничего не идёт.
  const instructorSet = new Set(instructorIds);
  const poolBase = (poolSubs ?? [])
    .filter((s) => s.sold_by && instructorSet.has(s.sold_by as string))
    .reduce((s, r) => s + Number(r.price ?? 0), 0);
  const subsPool = poolBase * SUBS_RATE;

  const isInstructor = role === "instructor"; // у босса ЗП нет — все слагаемые нули
  // Моя доля 15% за период. Считает lib/salary: база дня делится между теми,
  // кто открыл смену, в дни без смен остаётся тому, кто записал.
  const salaryFromSessions = isInstructor ? myShare.amount : 0;
  const salaryFromShifts = isInstructor ? myShifts.amount : 0;
  const salaryFromSubs =
    isInstructor && instructorIds.length > 0 ? subsPool / instructorIds.length : 0;

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
    shiftRows: myShifts.rows,
    sharedDays: myShare.sharedDays,
    ownDays: myShare.ownDays,
    subsPool,
    instructorsCount: instructorIds.length,
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
