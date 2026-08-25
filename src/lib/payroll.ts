import type { createClient } from "@/lib/supabase/server";
import {
  getInstructorStats,
  loadPayInputs,
  salaryFrom,
  type StatsRange,
} from "@/lib/stats";
import { getCrmPayout } from "@/lib/finance";
import { dayShort, monthName, vnMonth, vnPeriod, vnToday } from "@/lib/dates";
import { failIfReadError } from "@/lib/dbError";
import {
  DEV_WEEK_PAY,
  getMonthlyFixedPay,
  getSmmFixedPay,
  getWeeklyFixedPay,
  MECHANIC_MONTH_PAY,
  SMM_WEEK_PAY,
} from "@/lib/salary";
import {
  employedDuring,
  employmentLabel,
  isFired,
  loadAdmins,
  loadDevs,
  loadInstructors,
  loadMechanics,
  loadSmm,
  type StaffMember,
} from "@/lib/staff";

// «Выплата зарплаты»: кому школа должна и что уже отдала.
// Одна функция на страницу /admin/payroll и на выгрузку — цифры в файле и на
// экране не могут разойтись.
//
// Как считается НАЧИСЛЕНО за период:
//  • инструктор — доля 15% с занятий дня + 200 000 ₫ за каждый выход по
//    регламенту + доля котла абонементов (всё через getInstructorStats, те же
//    цифры человек видит у себя в кабинете);
//  • СММщик — фикс за каждую прошедшую субботу периода плюс его 1% с выручки,
//    но 1% закрывается раз в месяц, поэтому в начисление он попадает, только
//    когда выбран ровно календарный месяц (иначе показан справкой), а пока
//    месяц идёт — висит напоминалкой у ника (DueRow.monthly);
//  • агент — награды, подтверждённые в периоде;
//  • механик — ставки в системе нет, он появляется в списке, только если ему в
//    этом периоде платили.
// Уволенные из списка не пропадают, пока в периоде есть их рабочие дни: за
// отработанную неделю человеку платят напоследок (0036).
//
// Как считается ВЫПЛАЧЕНО (0043): по ДНЮ ВЫДАЧИ денег. Раньше выплата была
// жёстко привязана к периоду («за 3—9 августа выдано столько-то»), и одни и те
// же дни нельзя было закрыть дважды. Живая касса так не работает: аванс в
// среду, остаток в понедельник, иногда частями. Теперь выплата — это «кому,
// сколько и какого числа», а защита от двойной выдачи не запрет, а видимая
// разница «начислено − выплачено».
//
// Почему ОСТАТОК считается НАКОПИТЕЛЬНО, а не за выбранный период (14.08.2026).
// Пока «осталось» было разницей внутри окна, цифра зависела от того, как
// нарезать календарь: обе границы периода включительно, поэтому «1—8» и «8—14»
// пересекались по 8 августа — и занятия того дня, и выданные в тот день деньги
// попадали в оба расчёта. Живой пример: инструкторам выдали 8-го, после чего
// период «8—14» показывал, что им уже всё отдали. При этом «1—14» и «10—16»
// сходились — оттого и казалось, что цифры врут через раз.
// Теперь остаток — это сальдо человека: начислено с PAYROLL_EPOCH по сегодня
// минус выданное за то же время. Как календарь ни режь, «кому сколько должны»
// не меняется. Выбранный период остался справкой «сколько заработали за эти
// дни» и на остаток не влияет.
//
// Недельный фикс (СММ, разработчик) от этого чинится сам: он считается от
// точки отсчёта, а не внутри окна, поэтому недели больше не сгорают на стыке
// периодов («1—8» + «9—14» давало одну неделю вместо двух). С 17.08.2026 фикс
// вообще привязан к календарю — по одной ставке за каждую прошедшую субботу
// (см. getWeeklyFixedPay), так что нарезка периода на него не влияет никак.
//
// Админа в списке ДОЛГОВ нет намеренно: он босс, а не наёмный — школа сама себе
// ничего не начисляет. В списке ПОЛУЧАТЕЛЕЙ он есть: свою зарплату босс тоже
// забирает из кассы, и она вычитается из денег школы (lib/finance).

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Точка отсчёта накопительного долга: первый день, за который вся история
// выплат заведена в системе. Всё, что было раньше, школа закрыла вживую, а
// правила ЗП с тех пор менялись (300 000 → 200 000 за выход, дележ 15% по
// сменам) — пересчитывать июль сегодняшними формулами значило бы показать
// долги и переплаты, которых нет. Решение David от 14.08.2026.
export const PAYROLL_EPOCH = "2026-08-01";

// Сколько строк выплат читаем за один заход. Столько же, сколько в lib/clients
// и lib/sessions: у Supabase свой потолок на размер ответа, поэтому историю
// берём страницами, а не одним запросом с `.limit()`.
const PAGE_SIZE = 1000;

/** Кому платим: штат живёт в salary_payouts, агенты — в agent_payouts (0023). */
export type PayeeKind = "staff" | "agent";

export type DueKind =
  | "instructor"
  | "smm"
  | "dev"
  | "mechanic"
  | "agent"
  | "crm";

export interface DueDetail {
  label: string;
  value: number;
  hint?: string;
}

// Строка списка «кому сколько осталось».
//
// Две пары цифр намеренно: accrued/paid отвечают на вопрос «сколько человек
// заработал за выбранные дни», accruedToDate/paidToDate — «сколько школа ему
// должна прямо сейчас». Остаток считается только по второй паре.
export interface DueRow {
  key: string;
  /** null — справочная строка: доля Дэвида, её школа никому не выдаёт. */
  payee: { kind: PayeeKind; id: string } | null;
  kind: DueKind;
  name: string;
  accrued: number; // начислено за выбранный период
  paid: number; // выплачено в выбранном периоде, по дню выдачи
  accruedToDate: number; // начислено с PAYROLL_EPOCH по сегодня
  paidToDate: number; // выдано с PAYROLL_EPOCH по сегодня
  /** Сальдо: accruedToDate − paidToDate. null — ставки нет, долг не считаем. */
  left: number | null;
  employmentLabel: string | null;
  /** Уволен на сегодня. Рассчитавшийся уволенный из списка убирается. */
  fired: boolean;
  details: DueDetail[];
  /**
   * Напоминалка у ника: 1% с оборота недельщиков (СММщик, разработчик) за ещё
   * НЕ закрытый месяц. В `left` эта сумма намеренно не входит — месяц не
   * кончился, значит школа её пока не должна (решение David от 17.08.2026).
   * Когда месяц закроется, сумма сама переедет в «осталось выдать», а
   * напоминалка сменится на следующий месяц.
   */
  monthly?: { label: string; amount: number };
}

// Одна выплата — и в истории, и в подсчёте «выплачено за период».
export interface PayoutRow {
  id: string;
  kind: PayeeKind;
  payeeId: string;
  name: string;
  amount: number;
  paidOn: string;
  comment: string | null;
  /** Заполнен у отметок, сделанных до 0043: «выплачено за 3—9 авг». */
  period: { from: string; to: string } | null;
}

// Кого можно выбрать в форме выплаты.
export interface Payee {
  kind: PayeeKind;
  id: string;
  name: string;
  group: string; // «Инструкторы», «СММ», «Механик», «Агенты»
  suggested: number; // сколько подставить в поле суммы (осталось выдать)
  /** Уволен: в списке долгов его может не быть, а доплатить ему можно. */
  fired?: boolean;
}

export interface MonthlyPayroll {
  rows: DueRow[];
  payees: Payee[];
  accruedTotal: number; // за выбранный период
  paidTotal: number; // за выбранный период
  accruedToDateTotal: number; // с PAYROLL_EPOCH по сегодня
  paidToDateTotal: number;
  leftTotal: number; // сумма положительных сальдо — «сколько отдать сегодня»
  crmMonthLabel: string;
  crmInTotal: boolean;
  /** Точка отсчёта долга — экран подписывает ею накопительные цифры. */
  epoch: string;
}

// Последний день периода (включительно) — в StatsRange хранится эксклюзивная
// граница, а выплаты и трудовые даты живут в «человеческих».
function lastDayOf(range: StatsRange): string {
  const d = new Date(`${range.toDay}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Подсказка к строке 1% в «Как посчитали»: главное про эту сумму — когда её
// выдают и почему её нет в «осталось выдать».
function crmHint(monthOpen: boolean, inTotal: boolean): string | undefined {
  if (monthOpen) {
    return "выплачивается в конце месяца, в «осталось выдать» не входит";
  }
  return inTotal ? undefined : "в начисление за этот период не входит";
}

// Подпись месячного оклада: «Оклад · 2 мес. по 10 млн» / «Оклад · 10 млн в месяц».
function monthlyFixLabel(monthPay: number, months: number): string {
  const rate = String(monthPay / 1_000_000).replace(".", ",");
  return months > 0
    ? `Оклад · ${months} мес. по ${rate} млн`
    : `Оклад · ${rate} млн в месяц`;
}

// Подпись строки недельного фикса в «Как посчитали». При нуле выплат счётчик
// не пишем: «0 выпл.» рядом с нулём читается как поломка, а не как «суббота
// ещё не наступила».
function fixLabel(weekPay: number, weeks: number): string {
  const rate = String(weekPay / 1_000_000).replace(".", ",");
  return weeks > 0
    ? `Фикс · ${weeks} выпл. по ${rate} млн (по субботам)`
    : `Фикс · ${rate} млн по субботам`;
}

interface StaffPayoutRaw {
  id: string;
  instructor_id: string;
  amount: number | null;
  // paid_on в базе NOT NULL с 0043: старым выплатам он проставлен из paid_at,
  // поэтому запасных вариантов дня выдачи больше не нужно.
  paid_on: string;
  comment: string | null;
  period_from: string | null;
  period_to: string | null;
}

// Выплаты штату. Колонки 0043 (paid_on, comment) в боевой базе есть — повтор
// запроса «по-старому, по периоду» убран 15.08.2026: он подменял день выдачи
// началом периода, то есть выплата уезжала в другую неделю, и заметить это по
// экрану было нельзя.
// Сколько человеку ВЫДАЛИ за период — по дню выдачи (0043), одной суммой.
// Нужна карточке профиля в сайдбаре: разработчик видит там не деньги школы, а
// свою зарплату. Отдельный маленький запрос, а не getMonthlyPayroll: тому
// нужен весь штат, все выплаты и полный расчёт начислений — на каждый экран
// кабинета это десятки лишних запросов ради одной цифры.
export async function getPaidToStaff(
  supabase: Supabase,
  staffId: string,
  range: StatsRange,
): Promise<number> {
  const { data, error } = await supabase
    .from("salary_payouts")
    .select("amount")
    .eq("instructor_id", staffId)
    .gte("paid_on", range.fromDay)
    .lte("paid_on", lastDayOf(range));

  // Ноль в деньгах должен быть фактом, а не последствием сбойного запроса
  // (см. lib/dbError): «мне ничего не выплатили» — слишком серьёзное заявление.
  failIfReadError(error, "не удалось прочитать выплаты");
  return (data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
}

async function loadStaffPayouts(
  supabase: Supabase,
  filter?: { fromDay: string; lastDay: string },
): Promise<PayoutRow[]> {
  const query = (from: number) => {
    let q = supabase
      .from("salary_payouts")
      .select("id, instructor_id, amount, paid_on, comment, period_from, period_to");
    if (filter) {
      q = q.gte("paid_on", filter.fromDay).lte("paid_on", filter.lastDay);
    }
    return q.order("id").range(from, from + PAGE_SIZE - 1);
  };

  // Постранично, а не `.limit(1000)`. Тысяча — это примерно два года выдач при
  // десятке в неделю: после неё запрос молча отдавал бы часть истории, и
  // «выплачено» стало бы меньше настоящего, а «осталось выдать» — больше. Ту же
  // грабку уже прошли в lib/clients и lib/sessions, там всё описано подробно.
  const rows: StaffPayoutRaw[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await query(from);
    // Не прочитали выплаты — молчать нельзя: пустой список означает «никому
    // ничего не выдали», и «осталось выдать» вырастет на всё уже выданное
    // (см. lib/dbError). Раньше здесь стоял тихий `return []`.
    failIfReadError(error, "не удалось прочитать выплаты штату");

    const page = (data ?? []) as unknown as StaffPayoutRaw[];
    rows.push(...page);
    // Неполная страница = выплаты кончились.
    if (page.length < PAGE_SIZE) break;
  }

  return rows.map((r) => ({
    id: r.id,
    kind: "staff" as const,
    payeeId: r.instructor_id,
    name: "",
    amount: Number(r.amount ?? 0),
    paidOn: r.paid_on,
    comment: r.comment,
    period:
      r.period_from && r.period_to
        ? { from: r.period_from, to: r.period_to }
        : null,
  }));
}

interface AgentPayoutRaw {
  id: string;
  agent_id: string;
  amount: number | null;
  paid_on: string;
  comment: string | null;
}

async function loadAgentPayouts(
  supabase: Supabase,
  filter?: { fromDay: string; lastDay: string },
): Promise<PayoutRow[]> {
  const page = (from: number) => {
    let q = supabase
      .from("agent_payouts")
      .select("id, agent_id, amount, paid_on, comment");
    if (filter) {
      q = q.gte("paid_on", filter.fromDay).lte("paid_on", filter.lastDay);
    }
    return q.order("id").range(from, from + PAGE_SIZE - 1);
  };

  // Постранично по той же причине, что и выплаты штату выше.
  const rows: AgentPayoutRaw[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from);
    failIfReadError(error, "не удалось прочитать выплаты агентам");
    const chunk = (data ?? []) as unknown as AgentPayoutRaw[];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
  }

  return rows.map((r) => ({
    id: r.id,
    kind: "agent" as const,
    payeeId: r.agent_id,
    name: "",
    amount: Number(r.amount ?? 0),
    paidOn: r.paid_on,
    comment: r.comment,
    period: null,
  }));
}

// Имена: у штата — своя строка в users, у агента — имя его пользователя.
async function loadNames(
  supabase: Supabase,
): Promise<{ staff: Map<string, string>; agents: Map<string, string> }> {
  const [usersRes, agentsRes] = await Promise.all([
    supabase.from("users").select("id, name"),
    supabase.from("agents").select("id, user:users!user_id(name)"),
  ]);

  return {
    staff: new Map(
      (usersRes.data ?? []).map((u) => [u.id as string, u.name as string]),
    ),
    agents: new Map(
      (agentsRes.data ?? []).map((a) => [
        a.id as string,
        (a.user as unknown as { name: string } | null)?.name ?? "агент",
      ]),
    ),
  };
}

// Вся история выплат, свежее сверху: и штат, и агенты в одном списке.
// Страница группирует её по месяцам — отдельного запроса на месяц не делаем,
// выплат в школе десятки в год, а не тысячи.
export async function getPayoutHistory(
  supabase: Supabase,
): Promise<PayoutRow[]> {
  const [staff, agents, names] = await Promise.all([
    loadStaffPayouts(supabase),
    loadAgentPayouts(supabase),
    loadNames(supabase),
  ]);

  return [...staff, ...agents]
    .map((p) => ({
      ...p,
      name:
        (p.kind === "staff" ? names.staff.get(p.payeeId) : names.agents.get(p.payeeId)) ??
        "—",
    }))
    .sort((a, b) => b.paidOn.localeCompare(a.paidOn));
}

// Награды агентов за период — по дате подтверждения. Очереди «ожидают
// подтверждения» больше нет: занятие оформляют по факту оплаты, поэтому награда
// пишется сразу confirmed (см. recordClientAction).
async function loadAgentRewards(
  supabase: Supabase,
  range: StatsRange,
): Promise<Map<string, { count: number; sum: number }>> {
  const { data } = await supabase
    .from("referral_rewards")
    .select("referrer_id, amount")
    .eq("referrer_type", "agent")
    .eq("status", "confirmed")
    .gte("confirmed_at", range.fromIso)
    .lt("confirmed_at", range.toIso);

  const byAgent = new Map<string, { count: number; sum: number }>();
  for (const r of data ?? []) {
    const id = r.referrer_id as string;
    const entry = byAgent.get(id) ?? { count: 0, sum: 0 };
    entry.count += 1;
    entry.sum += Number(r.amount ?? 0);
    byAgent.set(id, entry);
  }
  return byAgent;
}

// Доля CRM (1%), НАЧИСЛЕННАЯ с точки отсчёта по сегодня. Она закрывается раз в
// месяц по его итогам, поэтому в долг попадают только уже прошедшие месяцы:
// пока август идёт, его 1% никому не начислен — начальник закрывает его 1
// сентября. Месяцев тут единицы, поэтому считаем в лоб, по месяцу за раз.
async function getCrmDueToDate(
  supabase: Supabase,
  today: string,
): Promise<number> {
  const months: string[] = [];
  for (
    let ym = PAYROLL_EPOCH.slice(0, 7);
    ym <= today.slice(0, 7);
    ym = vnMonth(ym).toDay.slice(0, 7)
  ) {
    months.push(ym);
  }

  const closed = months.map(vnMonth).filter((m) => m.toDay <= today);
  const payouts = await Promise.all(
    closed.map((m) => getCrmPayout(supabase, m)),
  );
  return payouts.reduce((s, p) => s + p.each, 0);
}

export async function getMonthlyPayroll(
  supabase: Supabase,
  range: StatsRange,
): Promise<MonthlyPayroll> {
  const lastDay = lastDayOf(range);
  const filter = { fromDay: range.fromDay, lastDay };

  // Накопительный период: с точки отсчёта по сегодня. Именно по нему считается
  // «осталось отдать», и он не зависит от того, какие даты выбраны сверху.
  const today = vnToday();
  const balanceLastDay = today < PAYROLL_EPOCH ? PAYROLL_EPOCH : today;
  const balanceRange = vnPeriod(PAYROLL_EPOCH, balanceLastDay);
  const balanceFilter = { fromDay: PAYROLL_EPOCH, lastDay: balanceLastDay };
  // Выбран ровно накопительный период — второй раз то же самое не считаем.
  const samePeriod =
    range.fromDay === balanceRange.fromDay && range.toDay === balanceRange.toDay;

  // CRM — за календарный месяц, в который попадает начало периода. Неделя на
  // стыке месяцев считается по своему первому дню: это ровно тот месяц, за
  // который начальник в этот момент закрывает долю.
  const crmMonth = vnMonth(range.fromDay.slice(0, 7));
  const crmInTotal =
    range.fromDay === crmMonth.fromDay && range.toDay === crmMonth.toDay;
  // Месяц ещё идёт: его 1% не в «осталось выдать», а в напоминалке у ника.
  // Закрытый месяц напоминалки не получает — он уже сидит в сальдо (crmToDate),
  // и чип рядом с «осталось выдать» читался бы как вторая, отдельная сумма.
  const crmMonthOpen = crmMonth.toDay > today;

  const [
    allInstructors,
    allSmm,
    allDevs,
    allMechanics,
    allAdmins,
    staffPaid,
    agentPaid,
    staffPaidToDate,
    agentPaidToDate,
    crm,
    crmToDate,
    rewards,
    rewardsToDate,
    agentsRes,
    payInputs,
  ] =
    await Promise.all([
      loadInstructors(supabase),
      loadSmm(supabase),
      loadDevs(supabase),
      loadMechanics(supabase),
      loadAdmins(supabase),
      loadStaffPayouts(supabase, filter),
      loadAgentPayouts(supabase, filter),
      loadStaffPayouts(supabase, balanceFilter),
      loadAgentPayouts(supabase, balanceFilter),
      getCrmPayout(supabase, crmMonth),
      getCrmDueToDate(supabase, balanceLastDay),
      loadAgentRewards(supabase, range),
      loadAgentRewards(supabase, balanceRange),
      supabase.from("agents").select("id, active, user:users!user_id(name)"),
      // Общие для всех инструкторов части расчёта ЗП (штат, котёл абонементов,
      // смены, дележ 15%) — читаем один раз на период, а не на каждого.
      loadPayInputs(supabase, range),
    ]);

  // То же самое за накопительный период — им считается «осталось выдать».
  // Выбран ровно он — второй раз не читаем.
  const balanceInputs = samePeriod
    ? payInputs
    : await loadPayInputs(supabase, balanceRange);

  const sumFor = (rows: PayoutRow[], kind: PayeeKind, id: string) =>
    rows
      .filter((p) => p.kind === kind && p.payeeId === id)
      .reduce((s, p) => s + p.amount, 0);

  const paidTo = (kind: PayeeKind, id: string) =>
    sumFor([...staffPaid, ...agentPaid], kind, id);
  const paidToDate = (kind: PayeeKind, id: string) =>
    sumFor([...staffPaidToDate, ...agentPaidToDate], kind, id);

  const rows: DueRow[] = [];

  // Человек попадает в список, если работал в выбранном периоде ИЛИ где-то
  // после точки отсчёта: сальдо уволенного в июле уже не покажешь, а вот
  // уволенному в августе школа может быть должна за отработанные дни.
  const inScope = (m: StaffMember) =>
    employedDuring(m, range.fromDay, lastDay) ||
    employedDuring(m, PAYROLL_EPOCH, balanceLastDay);

  // ── Инструкторы ────────────────────────────────────────────────────────────
  const instructors = allInstructors.filter(inScope);
  const instructorRows = await Promise.all(
    instructors.map(async (u: StaffMember) => {
      const s = await getInstructorStats(
        supabase,
        u.id,
        range,
        "instructor",
        supabase,
        payInputs,
      );
      // Сальдо — по накопительному периоду. Здесь нужна только сумма ЗП, а она
      // целиком складывается из общих частей: своих запросов не делаем вовсе.
      const salaryToDate = samePeriod
        ? s.salary
        : salaryFrom(balanceInputs, u.id).total;
      const paid = paidTo("staff", u.id);
      const paidAll = paidToDate("staff", u.id);
      return {
        key: `staff-${u.id}`,
        payee: { kind: "staff" as const, id: u.id },
        kind: "instructor" as const,
        name: u.name,
        accrued: s.salary,
        paid,
        accruedToDate: salaryToDate,
        paidToDate: paidAll,
        left: salaryToDate - paidAll,
        employmentLabel: employmentLabel(u),
        fired: isFired(u),
        details: [
          {
            label: "Доля 15% с занятий дня",
            value: s.salaryFromSessions,
            hint: `свои занятия: ${s.sessionsCount}`,
          },
          {
            label: `Выходы · зачтено ${s.shiftsCount} из ${s.shiftsCount + s.shiftsUnpaidCount}`,
            value: s.salaryFromShifts,
            hint:
              s.shiftsPlannedCount > 0
                ? `в графике ещё ${s.shiftsPlannedCount}`
                : undefined,
          },
          {
            // Две цифры про абонементы намеренно разведены (просьба начальника
            // от 25.08.2026): слева — со скольких абонементов посчиталась
            // сумма (котёл общий, в дележ идёт каждая оплата дня), справа —
            // сколько человек продал своими руками. Раньше стояла только
            // вторая, и «продал 1, а денег как за пять» выглядело ошибкой.
            label: `Доля с абонементов · с ${s.sharedSubsCount} шт.`,
            value: s.salaryFromSubs,
            hint: `продал сам: ${s.paidSubsCount}`,
          },
        ],
      };
    }),
  );
  rows.push(...instructorRows);

  // ── СММщик ─────────────────────────────────────────────────────────────────
  const smm = allSmm.filter(inScope);
  for (const u of smm) {
    const fix = getSmmFixedPay(range.fromDay, lastDay, u);
    // Сменные деньги сверх фикса (решение David от 21.08.2026): СММщик,
    // вышедший на пляж, зарабатывает как инструктор — те же три слагаемых, тот
    // же расчёт. Фикс при этом не трогаем: СММ-работу он всё равно делает.
    const s = await getInstructorStats(
      supabase,
      u.id,
      range,
      "smm",
      supabase,
      payInputs,
    );
    const salaryToDate = samePeriod ? s.salary : salaryFrom(balanceInputs, u.id).total;
    // 1% закрывается раз в месяц: в начисление он идёт, только когда выбран
    // ровно этот месяц, иначе к недельной выдаче прибавилась бы месячная сумма.
    const accrued = fix.amount + (crmInTotal ? crm.each : 0) + s.salary;
    // Долг: недели считаются от точки отсчёта — на стыке периодов дни-остатки
    // не сгорают, а копятся до полной недели.
    const fixToDate = getSmmFixedPay(PAYROLL_EPOCH, balanceLastDay, u);
    const accruedToDate = fixToDate.amount + crmToDate + salaryToDate;
    const paid = paidTo("staff", u.id);
    const paidAll = paidToDate("staff", u.id);
    // Строки про смены показываем, только если он на них выходил: у СММщика без
    // единого выхода три нуля в раскладке — лишний шум.
    const worked =
      s.salary > 0 || s.shiftsCount + s.shiftsUnpaidCount + s.shiftsPlannedCount > 0;
    rows.push({
      key: `staff-${u.id}`,
      payee: { kind: "staff", id: u.id },
      kind: "smm",
      name: u.name,
      accrued,
      paid,
      accruedToDate,
      paidToDate: paidAll,
      left: accruedToDate - paidAll,
      employmentLabel: employmentLabel(u),
      fired: isFired(u),
      monthly:
        crmMonthOpen && crm.each > 0
          ? { label: monthName(crmMonth.fromDay), amount: crm.each }
          : undefined,
      details: [
        {
          label: fixLabel(SMM_WEEK_PAY, fix.weeks),
          value: fix.amount,
          hint: isFired(u)
            ? undefined
            : `следующая — в сб, ${dayShort(fix.nextPayday)}`,
        },
        {
          label: `1% с выручки · ${crmMonth.label}`,
          value: crm.each,
          hint: crmHint(crmMonthOpen, crmInTotal),
        },
        ...(worked
          ? [
              {
                label: "Доля 15% с занятий дня",
                value: s.salaryFromSessions,
                hint: `свои занятия: ${s.sessionsCount}`,
              },
              {
                label: `Выходы · зачтено ${s.shiftsCount} из ${s.shiftsCount + s.shiftsUnpaidCount}`,
                value: s.salaryFromShifts,
                hint:
                  s.shiftsPlannedCount > 0
                    ? `в графике ещё ${s.shiftsPlannedCount}`
                    : undefined,
              },
              {
                label: `Доля с абонементов · с ${s.sharedSubsCount} шт.`,
                value: s.salaryFromSubs,
                hint: `продал сам: ${s.paidSubsCount} · только за дни, когда открыл смену`,
              },
            ]
          : []),
      ],
    });
  }

  // ── Разработчик ────────────────────────────────────────────────────────────
  // Считается ровно как СММщик, только ставка своя: 2,5 млн за полную неделю
  // плюс тот же 1% с оборота (вторая половина доли CRM). Раньше эта половина
  // висела справочной строкой «Дэвид · 1%» без получателя — выплатить её было
  // некому, потому что аккаунта у него не было.
  const devs = allDevs.filter(inScope);
  for (const u of devs) {
    const fix = getWeeklyFixedPay(DEV_WEEK_PAY, range.fromDay, lastDay, u);
    const accrued = fix.amount + (crmInTotal ? crm.each : 0);
    const fixToDate = getWeeklyFixedPay(
      DEV_WEEK_PAY,
      PAYROLL_EPOCH,
      balanceLastDay,
      u,
    );
    const accruedToDate = fixToDate.amount + crmToDate;
    const paid = paidTo("staff", u.id);
    const paidAll = paidToDate("staff", u.id);
    rows.push({
      key: `staff-${u.id}`,
      payee: { kind: "staff", id: u.id },
      kind: "dev",
      name: u.name,
      accrued,
      paid,
      accruedToDate,
      paidToDate: paidAll,
      left: accruedToDate - paidAll,
      employmentLabel: employmentLabel(u),
      fired: isFired(u),
      monthly:
        crmMonthOpen && crm.each > 0
          ? { label: monthName(crmMonth.fromDay), amount: crm.each }
          : undefined,
      details: [
        {
          label: fixLabel(DEV_WEEK_PAY, fix.weeks),
          value: fix.amount,
          hint: isFired(u)
            ? undefined
            : `следующая — в сб, ${dayShort(fix.nextPayday)}`,
        },
        {
          label: `1% с выручки · ${crmMonth.label}`,
          value: crm.each,
          hint: crmHint(crmMonthOpen, crmInTotal),
        },
      ],
    });
  }

  // ── Агенты ─────────────────────────────────────────────────────────────────
  const agentName = new Map(
    (agentsRes.data ?? []).map((a) => [
      a.id as string,
      (a.user as unknown as { name: string } | null)?.name ?? "агент",
    ]),
  );
  for (const [id, name] of agentName) {
    const reward = rewards.get(id) ?? { count: 0, sum: 0 };
    const rewardToDate = rewardsToDate.get(id) ?? { count: 0, sum: 0 };
    const paid = paidTo("agent", id);
    const paidAll = paidToDate("agent", id);
    // Агент, которому с точки отсчёта ничего не начислено и не выдано, в списке
    // долгов не нужен — он всё равно доступен в форме выплаты.
    if (rewardToDate.sum === 0 && paidAll === 0 && reward.sum === 0) continue;
    rows.push({
      key: `agent-${id}`,
      payee: { kind: "agent", id },
      kind: "agent",
      name,
      accrued: reward.sum,
      paid,
      accruedToDate: rewardToDate.sum,
      paidToDate: paidAll,
      left: rewardToDate.sum - paidAll,
      employmentLabel: null,
      fired: false,
      details: [
        {
          label: "Приведённые клиенты",
          value: reward.sum,
          hint: `${reward.count} за период`,
        },
      ],
    });
  }

  // ── Механик ────────────────────────────────────────────────────────────────
  // Оклад 10 млн в месяц (решение David от 21.08.2026). За смену он не получает
  // ничего, хотя открывает её наравне со всеми: его в SHIFT_CREW_ROLES нет.
  //
  // Начисляем за ЗАКРЫТЫЙ месяц, идущий висит напоминалкой у ника — то же
  // правило, что у 1% СММщика: за неотработанные дни школа не должна.
  const mechanics = allMechanics.filter(inScope);
  for (const u of mechanics) {
    const fix = getMonthlyFixedPay(MECHANIC_MONTH_PAY, range.fromDay, lastDay, u);
    const fixToDate = getMonthlyFixedPay(
      MECHANIC_MONTH_PAY,
      PAYROLL_EPOCH,
      balanceLastDay,
      u,
    );
    const paid = paidTo("staff", u.id);
    const paidAll = paidToDate("staff", u.id);
    rows.push({
      key: `staff-${u.id}`,
      payee: { kind: "staff", id: u.id },
      kind: "mechanic",
      name: u.name,
      accrued: fix.amount,
      paid,
      accruedToDate: fixToDate.amount,
      paidToDate: paidAll,
      left: fixToDate.amount - paidAll,
      employmentLabel: employmentLabel(u),
      fired: isFired(u),
      monthly:
        fixToDate.current > 0 && fixToDate.currentMonth
          ? {
              label: monthName(fixToDate.currentMonth),
              amount: fixToDate.current,
            }
          : undefined,
      details: [
        {
          label: monthlyFixLabel(MECHANIC_MONTH_PAY, fix.months),
          value: fix.amount,
          hint: isFired(u)
            ? undefined
            : `следующее — ${dayShort(fixToDate.nextPayday)}`,
        },
      ],
    });
  }

  // ── Прочий штат ────────────────────────────────────────────────────────────
  // Ставки в системе у них нет, поэтому в списке они появляются, только если
  // деньги им выдавали: иначе строка «осталось 0» просто шумит. Долг у такой
  // строки не считается вовсе (left = null): начислять школе нечего, и «минус
  // выданное» показало бы вечную переплату.
  const known = new Set(rows.map((r) => r.payee?.id).filter(Boolean));
  const names = await loadNames(supabase);
  for (const p of staffPaidToDate) {
    if (known.has(p.payeeId)) continue;
    known.add(p.payeeId);
    rows.push({
      key: `staff-${p.payeeId}`,
      payee: { kind: "staff", id: p.payeeId },
      kind: "mechanic",
      name: names.staff.get(p.payeeId) ?? "—",
      accrued: 0,
      paid: paidTo("staff", p.payeeId),
      accruedToDate: 0,
      paidToDate: paidToDate("staff", p.payeeId),
      left: null,
      employmentLabel: null,
      fired: false,
      details: [],
    });
  }

  // ── Доля Дэвида ────────────────────────────────────────────────────────────
  // Справочная строка: 1% с выручки школа сама себе не выдаёт, это его же
  // деньги. В «Итого» не входит, кнопки выплаты у неё нет.
  //
  // Нужна, только пока у разработчика нет своего аккаунта: с ним доля попадает
  // в его собственную строку выше, вместе с фиксом, и её уже можно выплатить.
  if (crm.each > 0 && devs.length === 0) {
    rows.push({
      key: "crm-david",
      payee: null,
      kind: "crm",
      name: `${crm.partners[0]} · 1% с выручки`,
      accrued: crm.each,
      paid: 0,
      accruedToDate: crm.each,
      paidToDate: 0,
      left: null,
      employmentLabel: null,
      fired: false,
      details: [
        {
          label: `база · ${crmMonth.label}`,
          value: crm.revenue,
          hint: "занятия месяца плюс оплаченные абонементы",
        },
      ],
    });
  }

  // Кого можно выбрать в форме: весь штат и все действующие агенты, даже если
  // в этом периоде им ничего не начислено — аванс выдают и «просто так».
  const payable = rows.filter((r) => r.payee);
  const suggestedFor = new Map(
    payable.map((r) => [
      `${r.payee!.kind}-${r.payee!.id}`,
      Math.max(0, r.left ?? 0),
    ]),
  );
  const groupOf = (kind: DueKind) =>
    kind === "instructor"
      ? "Инструкторы"
      : kind === "smm"
        ? "СММ"
        : kind === "dev"
          ? "Разработчик"
          : kind === "agent"
            ? "Агенты"
            : "Штат";

  const payees: Payee[] = [
    ...allInstructors.map((u) => ({
      kind: "staff" as const,
      id: u.id,
      name: u.name,
      group: groupOf("instructor"),
      fired: isFired(u),
      suggested: suggestedFor.get(`staff-${u.id}`) ?? 0,
    })),
    ...allSmm.map((u) => ({
      kind: "staff" as const,
      id: u.id,
      name: u.name,
      group: groupOf("smm"),
      fired: isFired(u),
      suggested: suggestedFor.get(`staff-${u.id}`) ?? 0,
    })),
    ...allDevs.map((u) => ({
      kind: "staff" as const,
      id: u.id,
      name: u.name,
      group: groupOf("dev"),
      fired: isFired(u),
      suggested: suggestedFor.get(`staff-${u.id}`) ?? 0,
    })),
    // Механик и админ: формулы ЗП у них нет, поэтому в списке долгов выше их и
    // не видно. Раньше их не было и в форме — выдачу приходилось заводить
    // отдельным ручным расходом, и связь «кому заплатили» терялась.
    ...allMechanics.map((u) => ({
      kind: "staff" as const,
      id: u.id,
      name: u.name,
      group: "Механик",
      fired: isFired(u),
      suggested: 0,
    })),
    ...allAdmins.map((u) => ({
      kind: "staff" as const,
      id: u.id,
      name: u.name,
      group: "Штат",
      fired: isFired(u),
      suggested: 0,
    })),
    ...(agentsRes.data ?? [])
      .filter((a) => a.active !== false)
      .map((a) => ({
        kind: "agent" as const,
        id: a.id as string,
        name: agentName.get(a.id as string) ?? "агент",
        group: groupOf("agent"),
        suggested: suggestedFor.get(`agent-${a.id}`) ?? 0,
      })),
  ];

  // Рассчитавшийся уволенный из списка уходит (15.08.2026, просьба David:
  // «Мишу уволили 4-го, пусть глаза не мозолит»). Условие строгое — человек
  // пропадает, только когда с ним всё закрыто:
  //   • за выбранные дни ему ничего не начислено,
  //   • в эти дни ему ничего не выдавали (иначе выплата была бы в истории, а
  //     строки, объясняющей её, на экране нет — и итоги «за период» разошлись
  //     бы с выгрузкой),
  //   • и школа ему больше ничего не должна.
  // Поэтому за прошлую неделю уволенный по-прежнему виден со своим заработком,
  // а если ему что-то не доплатили — не исчезнет никогда.
  const visibleRows = rows
    .filter(
      (r) => !(r.fired && r.accrued === 0 && r.paid === 0 && (r.left ?? 0) <= 0),
    )
    // Сначала те, кому ещё не выдали, и по убыванию суммы: экран отвечает на
    // вопрос «кому отдать сегодня». Равные суммы — по имени, чтобы не прыгало.
    .sort(
      (a, b) =>
        (b.left ?? 0) - (a.left ?? 0) || a.name.localeCompare(b.name, "ru"),
    );

  const payableRows = visibleRows.filter((r) => r.payee);
  return {
    rows: visibleRows,
    payees,
    accruedTotal: payableRows.reduce((s, r) => s + r.accrued, 0),
    paidTotal: payableRows.reduce((s, r) => s + r.paid, 0),
    accruedToDateTotal: payableRows.reduce((s, r) => s + r.accruedToDate, 0),
    paidToDateTotal: payableRows.reduce((s, r) => s + r.paidToDate, 0),
    // Переплата одному человеку не гасит долг другому: в «отдать сегодня»
    // складываем только положительные сальдо.
    leftTotal: payableRows.reduce((s, r) => s + Math.max(0, r.left ?? 0), 0),
    crmMonthLabel: crmMonth.label,
    crmInTotal,
    epoch: PAYROLL_EPOCH,
  };
}
