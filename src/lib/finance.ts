import type { createClient } from "@/lib/supabase/server";
import type { StatsRange } from "@/lib/stats";
import { SESSION_RATE, getShiftPay, getSubsShares } from "@/lib/salary";
import { loadInstructors } from "@/lib/staff";
import { loadAllSessions } from "@/lib/sessions";
import { failIfReadError } from "@/lib/dbError";

// Финансовая модель школы за период — питает вкладку «Расходы».
//
// СЧИТАЕМ ПО ЖИВЫМ ДЕНЬГАМ (решение David от 14.08.2026). Раньше здесь была
// прибыль по начислению: доля инструктора, комиссия агента и 2% CRM
// вычитались в день занятия, хотя деньги ещё лежали в кассе. Рядом на
// дашборде стояла касса — и два числа про одни и те же деньги путали больше,
// чем помогали. Теперь ответ один: СКОЛЬКО ДЕНЕГ НА РУКАХ.
//
//   пришло − 35% Marina − выданные зарплаты − выданное агентам − траты
//
// Вычитается ровно две вещи: доля площадки и то, что физически ушло.
//  • Marina Beach — 35% со ВСЕЙ выручки (сессии + оплаченные абонементы). Она
//    вычитается сразу и всегда: эти деньги нашими не были ни секунды.
//  • Зарплаты и комиссии — только по факту выдачи, из salary_payouts и
//    agent_payouts (вкладка «Выплата зарплаты»). Никаких расходов-двойников:
//    выплата и есть расход школы.
//  • Ручные траты (таблица expenses: аренда, топливо, инвентарь) — по дате
//    траты. Зарплате там не место, для неё есть «Выплаты».
//
// НАЧИСЛЕНО — теперь справка, а не вычет. ЗП инструкторов, комиссии агентов и
// 2% CRM по-прежнему считаются (экраны показывают «ещё должны людям», а
// «Выплаты» — кому сколько), но на цифру денег НЕ влияют. Цена решения: цифра
// прыгает — неделя без выплат выглядит богатой, день расчёта провальным.
// Поэтому долг людям обязан стоять рядом с остатком на всех экранах.
//
// ДВЕ ДАТЫ У ОДНОГО ЗАНЯТИЯ (0042, решение David от 12.08.2026). Гость мог
// заплатить в прошлом месяце, а кататься в этом. Поэтому период считается по
// двум разным колонкам, и это не описка:
//  • ДЕНЬГИ ШКОЛЫ — по денежной дате (money_date): выручка, 35% Marina, 2% CRM
//    и, как следствие, остаток. Чек лежит в том месяце, когда деньги пришли.
//  • ВЫПЛАТЫ ЛЮДЯМ — по дате занятия: 15% инструкторам, выходы, котёл
//    абонементов, комиссии агентов. Это плата за работу, а работали в день
//    занятия; недели уже закрыты выплатами, пересчитывать их задним числом
//    нельзя.
// Из-за этого 15% в отдельно взятом месяце могут считаться не с той выручки,
// что показана выше, — ровно на сумму «оплачено в другом месяце».
//
// Важно: сессии и абонементы АДМИНА в ЗП не попадают — он босс, и с его
// занятий никому ничего не начисляется, кроме 35% Marina. Если считать 15% со
// всей выручки без разбора, вкладка покажет фантомный долг инструкторам.

type Supabase = Awaited<ReturnType<typeof createClient>>;

interface SessionMoneyRow {
  amount: number | null;
}

interface SessionWorkRow {
  amount: number | null;
  agent_commission: number | null;
  instructor_id: string | null;
}

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
  const [sessions, subsRes] = await Promise.all([
    // Деньги — по денежной дате (0042).
    loadAllSessions<{ amount: number | null }>(supabase, "amount", {
      fromDay: range.fromDay,
      toDay: range.toDay,
      by: "money",
    }),
    supabase
      .from("subscriptions")
      .select("price")
      .not("paid_at", "is", null)
      .gte("paid_at", range.fromIso)
      .lt("paid_at", range.toIso),
  ]);

  const revenue =
    sessions.rows.reduce((s, r) => s + Number(r.amount ?? 0), 0) +
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
  // ── Деньги: из чего складывается остаток ──
  sessionsRevenue: number; // чеки занятий за период
  paidSubsRevenue: number; // абонементы, оплаченные в периоде
  revenue: number; // сумма выручки — «пришло»
  marina: number; // 35% от всей выручки — доля площадки, всегда вычитается
  paidStaff: number; // выдано штату за период (salary_payouts)
  paidAgents: number; // выдано агентам за период (agent_payouts)
  manualExpenses: ExpenseRow[]; // ручные траты за период (по убыванию суммы)
  manualTotal: number; // их сумма — для списка на экране
  otherSpent: number; // она же без старых двойников от выплат — для арифметики
  spent: number; // всё, что ушло: Marina + выплаты + траты
  cashLeft: number; // деньги на руках: revenue − spent

  // ── Начислено: справка, на cashLeft НЕ влияет ──
  instructorPay: number; // вся ЗП инструкторов (три слагаемых ниже)
  instructorSessionPay: number; // 15% с чеков сессий инструкторов
  instructorShiftPay: number; // 200 000 ₫ × зачтённые выходы инструкторов
  instructorSubsPay: number; // 15% с абонементов, проданных инструкторами
  instructorShifts: number; // сколько выходов оплачиваем
  instructorShiftsUnpaid: number; // выходы, срезанные регламентом (справка)
  instructorPaidOut: number; // из этой ЗП уже отдано на руки
  owedInstructors: number; // начислено − выдано, но не меньше нуля
  agentCommissions: number; // комиссии агентов по сессиям периода (пак D)
  crmCut: number; // 2% с сессий + абонементов
  crmEach: number; // доля одного (Дэвид / Ромчик) — половина crmCut
}

// Сколько денег физически выдали за период. Выплаты штату и агентам лежат в
// своих таблицах, прочие траты — в expenses.
//
// Тонкость с двойным счётом. До 14.08.2026 выплата «отдельной зарплаты» (фикс
// СММщика, механик, своя) заводила ещё и расход, храня ссылку на него в
// expense_id. Новые выплаты так не делают — выплата и есть расход, — но
// старые пары в базе остались, и такой расход из прочих трат вычитаем: иначе
// одна выдача считалась бы дважды.
async function loadCashOut(
  supabase: Supabase,
  range: StatsRange,
  lastDay: string,
  manual: ExpenseRow[],
): Promise<{ outStaff: number; outAgents: number; outOther: number }> {
  const sum = (rows: { amount: number | null }[] | null) =>
    (rows ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);

  const [staffRes, agentRes] = await Promise.all([
    supabase
      .from("salary_payouts")
      .select("amount, expense_id")
      .gte("paid_on", range.fromDay)
      .lte("paid_on", lastDay),
    supabase
      .from("agent_payouts")
      .select("amount")
      .gte("paid_on", range.fromDay)
      .lte("paid_on", lastDay),
  ]);

  // Выданное — основа «денег на руках»: не прочитали, значит и считать нечего
  // (см. lib/dbError). Раньше ошибка тут не проверялась вовсе, и любой сбой
  // запроса завышал остаток ровно на сумму всех выплат периода.
  failIfReadError(staffRes.error, "не удалось прочитать выплаты штату");
  failIfReadError(agentRes.error, "не удалось прочитать выплаты агентам");

  const staffRows = (staffRes.data ?? []) as {
    amount: number | null;
    expense_id: string | null;
  }[];
  const linked = new Set(
    staffRows.map((r) => r.expense_id).filter(Boolean) as string[],
  );

  return {
    outStaff: sum(staffRows),
    outAgents: sum(agentRes.data),
    outOther: manual
      .filter((e) => !linked.has(e.id))
      .reduce((s, e) => s + e.amount, 0),
  };
}

// Отметки «ЗП выдана» (0036) — по дню выдачи, внутри выбранного периода.
//
// Считаем ТОЛЬКО инструкторов. С 13.08.2026 в той же таблице лежат выплаты
// СММщика (его фикс), а строка на вкладке подписана «ЗП инструкторов — из них
// выдано на руки» и сравнивается с начисленной ЗП инструкторов, куда фикс
// СММщика не входит вовсе. Без фильтра его выплата задирала бы «выдано» и
// подпись врала бы «выплачено полностью», когда инструкторам ещё должны.
// С 0043 период у выплаты необязателен, зато обязателен день выдачи — по нему
// и считаем. Повтор «по-старому, по периоду» убран 15.08.2026: он молча
// пересчитывал выданное по другому правилу.
async function loadPaidOut(
  supabase: Supabase,
  range: StatsRange,
  instructorIds: string[],
): Promise<number> {
  if (instructorIds.length === 0) return 0;

  const lastDay = new Date(`${range.toDay}T00:00:00Z`);
  lastDay.setUTCDate(lastDay.getUTCDate() - 1);
  const lastDayStr = lastDay.toISOString().slice(0, 10);

  const sum = (rows: { amount: number | null }[] | null) =>
    (rows ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);

  const { data, error } = await supabase
    .from("salary_payouts")
    .select("amount")
    .in("instructor_id", instructorIds)
    .gte("paid_on", range.fromDay)
    .lte("paid_on", lastDayStr);
  failIfReadError(error, "не удалось прочитать выданную зарплату");
  return sum(data);
}

export async function getFinance(
  supabase: Supabase,
  range: StatsRange,
): Promise<Finance> {
  // Два набора занятий, потому что даты у денег и у работы разные (0042):
  //  • moneySessions — что оплачено в этом периоде: выручка школы;
  //  • workSessions — что откатано в этом периоде: с них 15% и комиссии агентов.
  // У занятия без paid_on обе даты совпадают, и наборы одинаковы — как раньше.
  const [moneySessions, workSessions, subsRes, expensesRes, staff] =
    await Promise.all([
      loadAllSessions<SessionMoneyRow>(supabase, "amount", {
        fromDay: range.fromDay,
        toDay: range.toDay,
        by: "money",
      }),
      loadAllSessions<SessionWorkRow>(
        supabase,
        "amount, agent_commission, instructor_id",
        { fromDay: range.fromDay, toDay: range.toDay },
      ),
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
      loadInstructors(supabase),
    ]);
  const instructorIds = staff.map((m) => m.id);

  // Выходы и котёл абонементов считает lib/salary — те же правила, что в
  // кабинете инструктора и в «Расчёте выплат». Здесь нужен итог по школе:
  // сколько всего денег уходит людям.
  //
  // Сколько из начисленной ЗП уже роздано: суммируем отметки «выплачено» по
  // периодам, целиком лежащим внутри выбранного (недели внутри месяца).
  // Начисление и выдача — разные события: в расчёт прибыли ЗП уходит сразу, а
  // деньги на руки отдают раз в неделю и не всегда всем сразу. Список
  // инструкторов нужен ей фильтром, поэтому запрос ждёт staff.
  const [shiftPay, subsShares, instructorPaidOut] = await Promise.all([
    getShiftPay(supabase, range, instructorIds),
    getSubsShares(supabase, range, staff),
    loadPaidOut(supabase, range, instructorIds),
  ]);

  const subs = subsRes.data ?? [];
  const sessionsRevenue = moneySessions.rows.reduce(
    (s, r) => s + Number(r.amount ?? 0),
    0,
  );
  const paidSubsRevenue = subs.reduce((s, r) => s + Number(r.price ?? 0), 0);
  const revenue = sessionsRevenue + paidSubsRevenue;

  // Выручка школы — вся; а вот ЗП платим только за работу инструкторов.
  // Всё, что откатал/продал сам админ, мимо ЗП — это его прибыль.
  const isInstructor = new Set(instructorIds);
  const instructorSessions = workSessions.rows.filter(
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
  const agentCommissions = workSessions.rows.reduce(
    (s, r) => s + Number(r.agent_commission ?? 0),
    0,
  );
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
  // Котёл целиком (кому сколько досталось — дело lib/salary): школе важна сумма.
  const instructorSubsPay = subsShares.pool;
  const instructorPay = instructorSessionPay + instructorShiftPay + instructorSubsPay;
  const crmCut = revenue * CRM_RATE;
  const crmEach = crmCut / 2;

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

  // Что реально ушло из кассы за период. outOther — те же manualExpenses, но
  // без старых расходов-двойников от выплат (см. loadCashOut), поэтому в
  // остатке участвует именно оно, а не manualTotal: список трат на экране
  // показываем полный, а считаем без задвоенных.
  const lastDayOfRange = new Date(`${range.toDay}T00:00:00Z`);
  lastDayOfRange.setUTCDate(lastDayOfRange.getUTCDate() - 1);
  const { outStaff, outAgents, outOther } = await loadCashOut(
    supabase,
    range,
    lastDayOfRange.toISOString().slice(0, 10),
    manualExpenses,
  );
  const spent = marina + outStaff + outAgents + outOther;

  return {
    sessionsRevenue,
    paidSubsRevenue,
    revenue,
    marina,
    paidStaff: outStaff,
    paidAgents: outAgents,
    manualExpenses,
    manualTotal,
    otherSpent: outOther,
    spent,
    cashLeft: revenue - spent,

    instructorPay,
    instructorSessionPay,
    instructorShiftPay,
    instructorSubsPay,
    instructorShifts,
    instructorShiftsUnpaid,
    instructorPaidOut,
    // Долг считаем только по инструкторам: у механика и админа начисления в
    // системе нет (ставку школа назначает сама), и «долг» по ним был бы
    // выдумкой. Точные цифры по каждому — на вкладке «Выплата зарплаты».
    owedInstructors: Math.max(0, instructorPay - instructorPaidOut),
    agentCommissions,
    crmCut,
    crmEach,
  };
}
