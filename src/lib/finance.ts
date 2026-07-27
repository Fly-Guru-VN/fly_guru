import type { createClient } from "@/lib/supabase/server";
import { getInstructorIds, type StatsRange } from "@/lib/stats";
import { SESSION_RATE, SUBS_RATE, getShiftPay } from "@/lib/salary";

// Финансовая модель школы за период — питает вкладку «Расходы».
// Как делятся деньги (пачка правок №3, паки E + H2):
//  • Marina Beach — 35% со ВСЕЙ выручки (сессии + оплаченные абонементы),
//    комиссия площадки.
//  • ЗП инструкторов — 15% с чеков ИХ сессий + 300 000 ₫ за каждый ЗАЧТЁННЫЙ
//    выход + 15% с абонементов, проданных ИМИ (тот же котёл, что в «Расчёте
//    месяца» и в кабинете инструктора, только целиком, а не подушевой долей).
//    Дележ 15% между сменщиками дня (пачка №9) на школу не влияет: сумма та
//    же, меняются только адресаты. А вот выходы теперь считаем по регламенту —
//    смена, открытая после 9:00, школе ничего не стоит (см. lib/salary).
//  • Дэвид + Ромчик (СММ) — 2% пополам (по 1%) со всего, что прошло через CRM:
//    сессии + оплаченные абонементы.
//  • Остаток — чистая прибыль, деньги босса, из неё вычитаем ручные расходы
//    (таблица expenses: аренда, топливо, инвентарь…).
//
// Важно: сессии и абонементы АДМИНА в ЗП не попадают — он босс и оставляет
// себе всё, кроме 35% Marina и 2% CRM. Его деньги и есть эта чистая прибыль.
// Если считать 15% со всей выручки без разбора, вкладка покажет фантомный
// расход и занизит прибыль.

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const MARINA_RATE = 0.35; // Marina Beach — со всей выручки
export const CRM_RATE = 0.02; // Дэвид + Ромчик — с сессий + абонементов (пополам)
export const CRM_PARTNERS = ["Дэвид", "Ромчик (СММ)"] as const; // делят CRM_RATE поровну

export interface CrmPayout {
  revenue: number; // база: сессии + оплаченные абонементы за период
  total: number; // 2% с неё — общая сумма на двоих
  each: number; // доля одного (по 1%)
  partners: readonly string[];
}

// Доля за CRM отдельно от остальной финмодели: её показывает не только вкладка
// «Расходы» (там она статья расхода школы), но и «Расчёт месяца» — это такая же
// выплата человеку, как ЗП инструктора. Ставка и список получателей общие,
// поэтому цифры на двух вкладках сойтись обязаны.
export async function getCrmPayout(
  supabase: Supabase,
  range: StatsRange,
): Promise<CrmPayout> {
  const [sessionsRes, subsRes] = await Promise.all([
    supabase
      .from("sessions")
      .select("amount")
      .gte("date", range.fromDay)
      .lt("date", range.toDay),
    supabase
      .from("subscriptions")
      .select("price")
      .not("paid_at", "is", null)
      .gte("paid_at", range.fromIso)
      .lt("paid_at", range.toIso),
  ]);

  const revenue =
    (sessionsRes.data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0) +
    (subsRes.data ?? []).reduce((s, r) => s + Number(r.price ?? 0), 0);
  const total = revenue * CRM_RATE;

  return {
    revenue,
    total,
    each: total / CRM_PARTNERS.length,
    partners: CRM_PARTNERS,
  };
}

export interface ExpenseRow {
  id: string;
  date: string;
  category: string | null;
  amount: number;
  comment: string | null;
  author: string | null; // кто внёс — чтобы отличать траты инструктора от своих
}

export interface Finance {
  sessionsRevenue: number; // чеки занятий за период
  paidSubsRevenue: number; // абонементы, оплаченные в периоде
  revenue: number; // сумма выручки
  marina: number; // 35% от всей выручки
  instructorPay: number; // вся ЗП инструкторов (три слагаемых ниже)
  instructorSessionPay: number; // 15% с чеков сессий инструкторов
  instructorShiftPay: number; // 300 000 ₫ × зачтённые выходы инструкторов
  instructorSubsPay: number; // 15% с абонементов, проданных инструкторами
  instructorShifts: number; // сколько выходов оплачиваем
  instructorShiftsUnpaid: number; // выходы, срезанные регламентом (справка)
  agentCommissions: number; // комиссии агентов по сессиям периода (пак D)
  crmCut: number; // 2% с сессий + абонементов
  crmEach: number; // доля одного (Дэвид / Ромчик) — половина crmCut
  autoTotal: number; // сумма основных (авто) расходов
  manualExpenses: ExpenseRow[]; // ручные расходы за период (по убыванию суммы)
  manualTotal: number; // их сумма
  netProfit: number; // выручка − авто − ручные
}

export async function getFinance(
  supabase: Supabase,
  range: StatsRange,
): Promise<Finance> {
  const [sessionsRes, subsRes, expensesRes, instructorIds] =
    await Promise.all([
      supabase
        .from("sessions")
        .select("amount, agent_commission, instructor_id")
        .gte("date", range.fromDay)
        .lt("date", range.toDay),
      supabase
        .from("subscriptions")
        .select("price, sold_by")
        .not("paid_at", "is", null)
        .gte("paid_at", range.fromIso)
        .lt("paid_at", range.toIso),
      supabase
        .from("expenses")
        .select(
          "id, date, amount, comment, category:expense_categories!category_id(name), author:users!created_by(name)",
        )
        .gte("date", range.fromDay)
        .lt("date", range.toDay)
        .order("amount", { ascending: false }),
      getInstructorIds(supabase),
    ]);

  // Выходы считает lib/salary — те же правила, что в кабинете инструктора и в
  // «Расчёте месяца». Здесь нужен только итог по школе.
  const shiftPay = await getShiftPay(supabase, range, instructorIds);

  const sessions = sessionsRes.data ?? [];
  const subs = subsRes.data ?? [];
  const sessionsRevenue = sessions.reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const paidSubsRevenue = subs.reduce((s, r) => s + Number(r.price ?? 0), 0);
  const revenue = sessionsRevenue + paidSubsRevenue;

  // Выручка школы — вся; а вот ЗП платим только за работу инструкторов.
  // Всё, что откатал/продал сам админ, мимо ЗП — это его прибыль.
  const isInstructor = new Set(instructorIds);
  const instructorSessions = sessions.filter(
    (r) => r.instructor_id && isInstructor.has(r.instructor_id as string),
  );
  // База 15%: чек минус комиссия агента по КАЖДОЙ сессии (пак D — агент
  // забирает свои 300к сверху). Считаем по одной, а не разностью двух сумм:
  // так цифра сходится с дележом по дням в lib/salary, где отрицательный
  // остаток одной сессии не съедает чужие чеки.
  const instructorSessionsBase = instructorSessions.reduce(
    (s, r) =>
      s + Math.max(0, Number(r.amount ?? 0) - Number(r.agent_commission ?? 0)),
    0,
  );
  // Все комиссии агентов за период — отдельная статья расхода школы: агент
  // забирает их «сверху» чека, из прибыли босса это надо вычесть.
  const agentCommissions = sessions.reduce(
    (s, r) => s + Number(r.agent_commission ?? 0),
    0,
  );
  const instructorSubsRevenue = subs
    .filter((r) => r.sold_by && isInstructor.has(r.sold_by as string))
    .reduce((s, r) => s + Number(r.price ?? 0), 0);
  let instructorShifts = 0;
  let instructorShiftsUnpaid = 0;
  let instructorShiftPay = 0;
  for (const info of shiftPay.values()) {
    instructorShifts += info.paidCount;
    instructorShiftsUnpaid += info.unpaidCount;
    instructorShiftPay += info.amount;
  }

  const marina = revenue * MARINA_RATE;
  const instructorSessionPay = instructorSessionsBase * SESSION_RATE;
  const instructorSubsPay = instructorSubsRevenue * SUBS_RATE;
  const instructorPay = instructorSessionPay + instructorShiftPay + instructorSubsPay;
  const crmCut = revenue * CRM_RATE;
  const crmEach = crmCut / 2;
  const autoTotal = marina + instructorPay + agentCommissions + crmCut;

  const manualExpenses = (expensesRes.data ?? []).map((e) => ({
    id: e.id as string,
    date: e.date as string,
    // Категория приходит вложенным объектом из справочника (0016). Её может не
    // быть: у расхода категория необязательна, и до 0016 она была текстом.
    category:
      (e.category as unknown as { name: string } | null)?.name ?? null,
    amount: Number(e.amount ?? 0),
    comment: (e.comment as string | null) ?? null,
    author:
      (e.author as unknown as { name: string } | null)?.name ?? null,
  }));
  const manualTotal = manualExpenses.reduce((s, e) => s + e.amount, 0);

  return {
    sessionsRevenue,
    paidSubsRevenue,
    revenue,
    marina,
    instructorPay,
    instructorSessionPay,
    instructorShiftPay,
    instructorSubsPay,
    instructorShifts,
    instructorShiftsUnpaid,
    agentCommissions,
    crmCut,
    crmEach,
    autoTotal,
    manualExpenses,
    manualTotal,
    netProfit: revenue - autoTotal - manualTotal,
  };
}
