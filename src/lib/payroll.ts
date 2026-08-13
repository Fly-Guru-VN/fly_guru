import type { createClient } from "@/lib/supabase/server";
import { getInstructorStats, type StatsRange } from "@/lib/stats";
import { getCrmPayout } from "@/lib/finance";
import { vnMonth } from "@/lib/dates";
import { getSmmFixedPay, SMM_WEEK_PAY } from "@/lib/salary";
import {
  employedDuring,
  employmentLabel,
  loadInstructors,
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
//  • СММщик — фикс за полные недели периода плюс его 1% с выручки, но 1%
//    закрывается раз в месяц, поэтому в начисление он попадает, только когда
//    выбран ровно календарный месяц (иначе показан справкой);
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
// Админа тут нет намеренно: он босс, а не наёмный — школа сама себе не платит.
// Его деньги (сессия минус 35% Marina и 2% CRM) видны как прибыль в lib/finance.

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Кому платим: штат живёт в salary_payouts, агенты — в agent_payouts (0023). */
export type PayeeKind = "staff" | "agent";

export type DueKind = "instructor" | "smm" | "mechanic" | "agent" | "crm";

export interface DueDetail {
  label: string;
  value: number;
  hint?: string;
}

// Строка списка «кому сколько осталось».
export interface DueRow {
  key: string;
  /** null — справочная строка: доля Дэвида, её школа никому не выдаёт. */
  payee: { kind: PayeeKind; id: string } | null;
  kind: DueKind;
  name: string;
  accrued: number;
  paid: number; // выплачено в этом периоде, по дню выдачи
  left: number; // accrued − paid, может быть отрицательным (переплата)
  employmentLabel: string | null;
  details: DueDetail[];
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
  suggested: number; // сколько подставить в поле суммы (осталось отдать)
}

export interface MonthlyPayroll {
  rows: DueRow[];
  payees: Payee[];
  accruedTotal: number;
  paidTotal: number;
  leftTotal: number;
  crmMonthLabel: string;
  crmInTotal: boolean;
}

// Последний день периода (включительно) — в StatsRange хранится эксклюзивная
// граница, а выплаты и трудовые даты живут в «человеческих».
function lastDayOf(range: StatsRange): string {
  const d = new Date(`${range.toDay}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

interface StaffPayoutRaw {
  id: string;
  instructor_id: string;
  amount: number | null;
  paid_on?: string | null;
  paid_at?: string | null;
  comment?: string | null;
  period_from: string | null;
  period_to: string | null;
}

// Выплаты штату. Колонки 0043 (paid_on, comment) могут быть ещё не накатаны —
// тогда читаем по-старому и днём выдачи считаем начало периода: страница
// работает, просто без свободных выплат (их и записать пока некуда).
async function loadStaffPayouts(
  supabase: Supabase,
  filter?: { fromDay: string; lastDay: string },
): Promise<PayoutRow[]> {
  const full =
    "id, instructor_id, amount, paid_on, comment, period_from, period_to";
  const legacy = "id, instructor_id, amount, paid_at, period_from, period_to";

  const query = (columns: string, byDay: boolean) => {
    let q = supabase.from("salary_payouts").select(columns);
    if (filter) {
      q = byDay
        ? q.gte("paid_on", filter.fromDay).lte("paid_on", filter.lastDay)
        : q.gte("period_from", filter.fromDay).lte("period_to", filter.lastDay);
    }
    return q.limit(1000);
  };

  let rows: StaffPayoutRaw[] = [];
  const { data, error } = await query(full, true);
  if (!error) {
    rows = (data ?? []) as unknown as StaffPayoutRaw[];
  } else {
    const { data: old, error: oldError } = await query(legacy, false);
    // Таблицы нет вовсе — миграция 0036 не накатана. Не роняем страницу.
    if (oldError) return [];
    rows = (old ?? []) as unknown as StaffPayoutRaw[];
  }

  return rows.map((r) => ({
    id: r.id,
    kind: "staff" as const,
    payeeId: r.instructor_id,
    name: "",
    amount: Number(r.amount ?? 0),
    paidOn:
      r.paid_on ?? (r.paid_at ? r.paid_at.slice(0, 10) : (r.period_from ?? "")),
    comment: r.comment ?? null,
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
  let q = supabase
    .from("agent_payouts")
    .select("id, agent_id, amount, paid_on, comment");
  if (filter) q = q.gte("paid_on", filter.fromDay).lte("paid_on", filter.lastDay);

  const { data, error } = await q.limit(1000);
  if (error) return [];

  return ((data ?? []) as unknown as AgentPayoutRaw[]).map((r) => ({
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

export async function getMonthlyPayroll(
  supabase: Supabase,
  range: StatsRange,
): Promise<MonthlyPayroll> {
  const lastDay = lastDayOf(range);
  const filter = { fromDay: range.fromDay, lastDay };

  // CRM — за календарный месяц, в который попадает начало периода. Неделя на
  // стыке месяцев считается по своему первому дню: это ровно тот месяц, за
  // который начальник в этот момент закрывает долю.
  const crmMonth = vnMonth(range.fromDay.slice(0, 7));
  const crmInTotal =
    range.fromDay === crmMonth.fromDay && range.toDay === crmMonth.toDay;

  const [allInstructors, allSmm, staffPaid, agentPaid, crm, rewardsRes, agentsRes] =
    await Promise.all([
      loadInstructors(supabase),
      loadSmm(supabase),
      loadStaffPayouts(supabase, filter),
      loadAgentPayouts(supabase, filter),
      getCrmPayout(supabase, crmMonth),
      // Награды агентов — по месяцу подтверждения. Очереди «ожидают
      // подтверждения» больше нет: занятие оформляют по факту оплаты, поэтому
      // награда пишется сразу confirmed (см. recordClientAction).
      supabase
        .from("referral_rewards")
        .select("referrer_id, amount")
        .eq("referrer_type", "agent")
        .eq("status", "confirmed")
        .gte("confirmed_at", range.fromIso)
        .lt("confirmed_at", range.toIso),
      supabase.from("agents").select("id, active, user:users!user_id(name)"),
    ]);

  const paidTo = (kind: PayeeKind, id: string) =>
    [...staffPaid, ...agentPaid]
      .filter((p) => p.kind === kind && p.payeeId === id)
      .reduce((s, p) => s + p.amount, 0);

  const rows: DueRow[] = [];

  // ── Инструкторы ────────────────────────────────────────────────────────────
  const instructors = allInstructors.filter((m) =>
    employedDuring(m, range.fromDay, lastDay),
  );
  const instructorRows = await Promise.all(
    instructors.map(async (u: StaffMember) => {
      const s = await getInstructorStats(supabase, u.id, range, "instructor");
      const paid = paidTo("staff", u.id);
      return {
        key: `staff-${u.id}`,
        payee: { kind: "staff" as const, id: u.id },
        kind: "instructor" as const,
        name: u.name,
        accrued: s.salary,
        paid,
        left: s.salary - paid,
        employmentLabel: employmentLabel(u),
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
            label: "Доля с абонементов",
            value: s.salaryFromSubs,
            hint: `продал сам: ${s.paidSubsCount}`,
          },
        ],
      };
    }),
  );
  rows.push(...instructorRows);

  // ── СММщик ─────────────────────────────────────────────────────────────────
  const smm = allSmm.filter((m) => employedDuring(m, range.fromDay, lastDay));
  for (const u of smm) {
    const fix = getSmmFixedPay(range.fromDay, lastDay, u);
    // 1% закрывается раз в месяц: в начисление он идёт, только когда выбран
    // ровно этот месяц, иначе к недельной выдаче прибавилась бы месячная сумма.
    const accrued = fix.amount + (crmInTotal ? crm.each : 0);
    const paid = paidTo("staff", u.id);
    rows.push({
      key: `staff-${u.id}`,
      payee: { kind: "staff", id: u.id },
      kind: "smm",
      name: u.name,
      accrued,
      paid,
      left: accrued - paid,
      employmentLabel: employmentLabel(u),
      details: [
        {
          label: `Фикс · ${fix.weeks} нед. по ${SMM_WEEK_PAY / 1_000_000} млн`,
          value: fix.amount,
          hint:
            fix.spareDays > 0
              ? `${fix.spareDays} дн. до полной недели не хватило`
              : undefined,
        },
        {
          label: `1% с выручки · ${crmMonth.label}`,
          value: crm.each,
          hint: crmInTotal ? undefined : "в начисление за этот период не входит",
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
  const rewardByAgent = new Map<string, { count: number; sum: number }>();
  for (const r of rewardsRes.data ?? []) {
    const id = r.referrer_id as string;
    const entry = rewardByAgent.get(id) ?? { count: 0, sum: 0 };
    entry.count += 1;
    entry.sum += Number(r.amount ?? 0);
    rewardByAgent.set(id, entry);
  }
  for (const [id, name] of agentName) {
    const reward = rewardByAgent.get(id) ?? { count: 0, sum: 0 };
    const paid = paidTo("agent", id);
    // Агент без наград и без выплат в этом периоде в списке долгов не нужен —
    // он всё равно доступен в форме выплаты.
    if (reward.sum === 0 && paid === 0) continue;
    rows.push({
      key: `agent-${id}`,
      payee: { kind: "agent", id },
      kind: "agent",
      name,
      accrued: reward.sum,
      paid,
      left: reward.sum - paid,
      employmentLabel: null,
      details: [
        {
          label: "Приведённые клиенты",
          value: reward.sum,
          hint: `${reward.count} за период`,
        },
      ],
    });
  }

  // ── Механик и прочий штат ──────────────────────────────────────────────────
  // Ставки в системе у него нет, поэтому в списке он появляется, только если
  // деньги ему в этом периоде выдавали: иначе строка «осталось 0» просто шумит.
  const known = new Set(rows.map((r) => r.payee?.id).filter(Boolean));
  const names = await loadNames(supabase);
  for (const p of staffPaid) {
    if (known.has(p.payeeId)) continue;
    known.add(p.payeeId);
    const paid = paidTo("staff", p.payeeId);
    rows.push({
      key: `staff-${p.payeeId}`,
      payee: { kind: "staff", id: p.payeeId },
      kind: "mechanic",
      name: names.staff.get(p.payeeId) ?? "—",
      accrued: 0,
      paid,
      left: -paid,
      employmentLabel: null,
      details: [],
    });
  }

  // ── Доля Дэвида ────────────────────────────────────────────────────────────
  // Справочная строка: 1% с выручки школа сама себе не выдаёт, это его же
  // деньги. В «Итого» не входит, кнопки выплаты у неё нет.
  if (crm.each > 0) {
    rows.push({
      key: "crm-david",
      payee: null,
      kind: "crm",
      name: `${crm.partners[0]} · 1% с выручки`,
      accrued: crm.each,
      paid: 0,
      left: 0,
      employmentLabel: null,
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
    payable.map((r) => [`${r.payee!.kind}-${r.payee!.id}`, Math.max(0, r.left)]),
  );
  const groupOf = (kind: DueKind) =>
    kind === "instructor"
      ? "Инструкторы"
      : kind === "smm"
        ? "СММ"
        : kind === "agent"
          ? "Агенты"
          : "Штат";

  const payees: Payee[] = [
    ...allInstructors.map((u) => ({
      kind: "staff" as const,
      id: u.id,
      name: u.name,
      group: groupOf("instructor"),
      suggested: suggestedFor.get(`staff-${u.id}`) ?? 0,
    })),
    ...allSmm.map((u) => ({
      kind: "staff" as const,
      id: u.id,
      name: u.name,
      group: groupOf("smm"),
      suggested: suggestedFor.get(`staff-${u.id}`) ?? 0,
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

  // Сначала те, кому ещё должны, и по убыванию долга: экран отвечает на вопрос
  // «кому отдать сегодня». Равные суммы — по имени, чтобы список не прыгал.
  rows.sort(
    (a, b) => b.left - a.left || a.name.localeCompare(b.name, "ru"),
  );

  const payableRows = rows.filter((r) => r.payee);
  return {
    rows,
    payees,
    accruedTotal: payableRows.reduce((s, r) => s + r.accrued, 0),
    paidTotal: payableRows.reduce((s, r) => s + r.paid, 0),
    leftTotal: payableRows.reduce((s, r) => s + Math.max(0, r.left), 0),
    crmMonthLabel: crmMonth.label,
    crmInTotal,
  };
}
