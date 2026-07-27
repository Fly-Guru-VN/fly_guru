import type { createClient } from "@/lib/supabase/server";
import { getInstructorStats, type StatsRange } from "@/lib/stats";
import { getCrmPayout, type CrmPayout } from "@/lib/finance";

// Расчёт месяца: кому и сколько школа должна выплатить.
// Одна функция на страницу /admin/payroll и на CSV-выгрузку — цифры в файле
// и на экране не могут разойтись.
//
// Инструкторы: доля 15% с сессий (делится по сменам дня) + 300 000 ₫ за каждый
// выход, отработанный по регламенту, + доля абонементного котла — всё через
// getInstructorStats, те же цифры инструктор видит у себя в кабинете.
// Агенты: подтверждённые в этом месяце награды (клиент дошёл до услуги).
// CRM (Дэвид + Ромчик): 2% со всей выручки месяца пополам — та же цифра, что
// во вкладке «Расходы», но здесь она нужна как выплата: месяц закрыли — видно,
// кому сколько отдать, без похода на другую вкладку.
// Админа тут нет намеренно: он босс, а не наёмный — школа сама себе не платит.
// Его деньги (сессия минус 35% Marina и 2% CRM) видны как прибыль в lib/finance.

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface InstructorPayout {
  id: string;
  name: string;
  sessionsCount: number;
  sessionsRevenue: number;
  salaryFromSessions: number;
  shiftsCount: number; // зачтённые выходы
  shiftsUnpaidCount: number; // выходы, срезанные регламентом или снятые админом
  salaryFromShifts: number;
  paidSubsCount: number; // продал сам — справка, на сумму не влияет
  salaryFromSubs: number; // доля котла
  total: number;
}

export interface AgentPayout {
  id: string;
  name: string;
  confirmedCount: number; // подтверждённых наград в месяце
  total: number; // их сумма к выплате
}

export interface MonthlyPayroll {
  instructors: InstructorPayout[];
  agents: AgentPayout[];
  crm: CrmPayout; // Дэвид + Ромчик: 2% с выручки месяца пополам
  grandTotal: number;
}

export async function getMonthlyPayroll(
  supabase: Supabase,
  range: StatsRange,
): Promise<MonthlyPayroll> {
  // Только наёмные инструкторы: админ-босс себе ЗП не начисляет.
  const { data: staff } = await supabase
    .from("users")
    .select("id, name")
    .eq("role", "instructor")
    .order("name");

  const instructors: InstructorPayout[] = await Promise.all(
    (staff ?? []).map(async (u) => {
      const s = await getInstructorStats(supabase, u.id, range, "instructor");
      return {
        id: u.id,
        name: u.name,
        sessionsCount: s.sessionsCount,
        sessionsRevenue: s.revenue,
        salaryFromSessions: s.salaryFromSessions,
        shiftsCount: s.shiftsCount,
        shiftsUnpaidCount: s.shiftsUnpaidCount,
        salaryFromShifts: s.salaryFromShifts,
        paidSubsCount: s.paidSubsCount,
        salaryFromSubs: s.salaryFromSubs,
        total: s.salary,
      };
    }),
  );

  // Награды агентов — по месяцу подтверждения. Очереди «ожидают подтверждения»
  // больше нет: занятие оформляют по факту оплаты, поэтому награда пишется
  // сразу confirmed (см. recordClientAction). Пока статус pending существовал,
  // агент висел в очереди и получал в расчёте месяца 0.
  const [confirmedRes, agentsRes, crm] = await Promise.all([
    supabase
      .from("referral_rewards")
      .select("referrer_id, amount")
      .eq("referrer_type", "agent")
      .eq("status", "confirmed")
      .gte("confirmed_at", range.fromIso)
      .lt("confirmed_at", range.toIso),
    supabase.from("agents").select("id, user:users!user_id(name)"),
    getCrmPayout(supabase, range),
  ]);

  const agentName = new Map(
    (agentsRes.data ?? []).map((a) => [
      a.id as string,
      (a.user as unknown as { name: string } | null)?.name ?? "агент",
    ]),
  );

  const byAgent = new Map<string, AgentPayout>();
  const agent = (id: string): AgentPayout => {
    let a = byAgent.get(id);
    if (!a) {
      a = {
        id,
        name: agentName.get(id) ?? "агент",
        confirmedCount: 0,
        total: 0,
      };
      byAgent.set(id, a);
    }
    return a;
  };
  for (const r of confirmedRes.data ?? []) {
    const a = agent(r.referrer_id as string);
    a.confirmedCount += 1;
    a.total += (r.amount as number) ?? 0;
  }
  const agents = [...byAgent.values()].sort((a, b) => b.total - a.total);

  // «Итого к выплате» = все деньги, которые школа раздаёт по итогам месяца,
  // включая долю за CRM: иначе цифра в шапке страницы не сходилась бы с суммой
  // блоков под ней.
  const grandTotal =
    instructors.reduce((s, i) => s + i.total, 0) +
    agents.reduce((s, a) => s + a.total, 0) +
    crm.total;

  return { instructors, agents, crm, grandTotal };
}
