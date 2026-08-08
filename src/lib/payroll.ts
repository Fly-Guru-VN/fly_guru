import type { createClient } from "@/lib/supabase/server";
import { getInstructorStats, type StatsRange } from "@/lib/stats";
import { getCrmPayout, type CrmPayout } from "@/lib/finance";
import { vnMonth } from "@/lib/dates";
import {
  employedDuring,
  employmentLabel,
  loadInstructors,
  type StaffMember,
} from "@/lib/staff";

// Расчёт выплат: кому и сколько школа должна отдать за период.
// Одна функция на страницу /admin/payroll и на выгрузку — цифры в файле
// и на экране не могут разойтись. Период любой: инструкторам платят раз в
// неделю, месяц — просто ещё один диапазон (см. комментарий на странице).
//
// Инструкторы: доля 15% с сессий (делится по сменам дня) + 200 000 ₫ за каждый
// выход, отработанный по регламенту, + доля абонементного котла — всё через
// getInstructorStats, те же цифры инструктор видит у себя в кабинете.
// Уволенные из списка не пропадают, пока в периоде есть их рабочие дни: за
// отработанную неделю человеку платят напоследок (0036).
// Агенты: подтверждённые в этом месяце награды (клиент дошёл до услуги).
// CRM (Дэвид + Ромчик): 2% со всей выручки — считается ВСЕГДА ЗА КАЛЕНДАРНЫЙ
// МЕСЯЦ, даже когда на экране выбрана неделя (решение David от 08.08.2026):
// инструкторам платят понедельно, а эта доля закрывается раз в месяц, и
// недельные её куски никому не нужны — их только путали с суммой к выдаче.
// Поэтому в «Итого к выплате» она попадает, лишь когда выбран ровно этот месяц.
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
  shiftsPlannedCount: number; // смены графика, до которых месяц ещё не дошёл
  salaryFromShifts: number;
  paidSubsCount: number; // продал сам — справка, на сумму не влияет
  salaryFromSubs: number; // доля котла
  total: number;
  employmentLabel: string | null; // «уволен 5 авг» / «с 12 авг» — иначе null
  // Все выплаты, ЗАДЕВАЮЩИЕ выбранный период, — показываем их всегда, каким бы
  // периодом человек ни смотрел. Иначе выплату за 1–5 не видно на экране 1–8,
  // и ту же неделю выдают второй раз.
  payouts: PayoutMark[];
  exactPayout: PayoutMark | null; // выплата ровно за этот период (её можно снять)
  blocked: boolean; // дни уже закрыты другой выплатой — новую ставить нельзя
}

// Отметка о выдаче: за какой период, сколько и когда отдали. Сумму храним
// снимком — поздняя правка сессии не должна переписывать историю выплаты.
export interface PayoutMark {
  id: string;
  from: string; // первый день периода, включительно
  to: string; // последний день, включительно
  amount: number;
  paidAt: string;
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
  crm: CrmPayout; // Дэвид + Ромчик: 2% с выручки МЕСЯЦА пополам
  crmMonthLabel: string; // «август 2026» — за какой месяц посчитан CRM
  crmInTotal: boolean; // выбран ровно этот месяц → доля входит в «Итого»
  grandTotal: number;
  paidOutTotal: number; // сколько из этого уже отдано инструкторам
  // Кому нельзя ставить выплату за выбранный период: эти дни уже закрыты
  // другой отметкой. Имена нужны шапке — подсветить поля дат и объяснить.
  blockedNames: string[];
}

// Выплаты, ЗАДЕВАЮЩИЕ выбранный период (пересекающиеся хотя бы одним днём).
//
// Сначала брались только совпадающие точь-в-точь — и это давало дыру: отметил
// выплату за 1–5, потом посмотрел 1–8 и отметил ещё раз. Второй период
// накрывает первый, но строки разные, поэтому экран показывал чистую кнопку, и
// одна и та же неделя оказывалась выданной дважды. Теперь пересечение видно
// всегда: два периода пересекаются, если каждый начинается не позже, чем
// заканчивается другой.
export async function loadPayouts(
  supabase: Supabase,
  fromDay: string,
  lastDay: string,
): Promise<Map<string, PayoutMark[]>> {
  const { data, error } = await supabase
    .from("salary_payouts")
    .select("id, instructor_id, period_from, period_to, amount, paid_at")
    .lte("period_from", lastDay)
    .gte("period_to", fromDay)
    .order("period_from");
  // Таблицы нет — миграция 0036 ещё не накатана. Не роняем страницу: расчёт
  // работает и без отметок, просто ни у кого не стоит галочка.
  if (error) return new Map();

  const byInstructor = new Map<string, PayoutMark[]>();
  for (const r of data ?? []) {
    const id = r.instructor_id as string;
    const list = byInstructor.get(id) ?? [];
    list.push({
      id: r.id as string,
      from: r.period_from as string,
      to: r.period_to as string,
      amount: Number(r.amount ?? 0),
      paidAt: r.paid_at as string,
    });
    byInstructor.set(id, list);
  }
  return byInstructor;
}

// Последний день периода (включительно) — в StatsRange хранится эксклюзивная
// граница, а отметки о выплате и трудовые даты живут в «человеческих».
function lastDayOf(range: StatsRange): string {
  const d = new Date(`${range.toDay}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function getMonthlyPayroll(
  supabase: Supabase,
  range: StatsRange,
): Promise<MonthlyPayroll> {
  const lastDay = lastDayOf(range);

  // Только наёмные инструкторы: админ-босс себе ЗП не начисляет. Уволенных
  // отсеиваем не по факту увольнения, а по периоду: если человек отработал в
  // нём хоть день — он в списке.
  const staff = (await loadInstructors(supabase)).filter((m) =>
    employedDuring(m, range.fromDay, lastDay),
  );
  const payouts = await loadPayouts(supabase, range.fromDay, lastDay);

  const unsorted: InstructorPayout[] = await Promise.all(
    staff.map(async (u: StaffMember) => {
      const s = await getInstructorStats(supabase, u.id, range, "instructor");
      const mine = payouts.get(u.id) ?? [];
      const exact = mine.find(
        (p) => p.from === range.fromDay && p.to === lastDay,
      );
      return {
        id: u.id,
        name: u.name,
        sessionsCount: s.sessionsCount,
        sessionsRevenue: s.revenue,
        salaryFromSessions: s.salaryFromSessions,
        shiftsCount: s.shiftsCount,
        shiftsUnpaidCount: s.shiftsUnpaidCount,
        shiftsPlannedCount: s.shiftsPlannedCount,
        salaryFromShifts: s.salaryFromShifts,
        paidSubsCount: s.paidSubsCount,
        salaryFromSubs: s.salaryFromSubs,
        total: s.salary,
        employmentLabel: employmentLabel(u),
        payouts: mine,
        exactPayout: exact ?? null,
        // Дни закрыты чужой отметкой: снимать её вслепую нельзя (там своя
        // сумма и свой период), поэтому просто не даём отметить второй раз.
        blocked: mine.length > 0 && !exact,
      };
    }),
  );

  // По убыванию суммы: экран отвечает на вопрос «кто сколько заработал за
  // неделю», и алфавитный порядок для этого приходилось читать глазами.
  // Равные суммы (например два нуля) — по имени, чтобы список не прыгал.
  const instructors = unsorted.sort(
    (a, b) => b.total - a.total || a.name.localeCompare(b.name, "ru"),
  );

  // Награды агентов — по месяцу подтверждения. Очереди «ожидают подтверждения»
  // больше нет: занятие оформляют по факту оплаты, поэтому награда пишется
  // сразу confirmed (см. recordClientAction). Пока статус pending существовал,
  // агент висел в очереди и получал в расчёте месяца 0.
  //
  // CRM — за календарный месяц, в который попадает начало периода. Неделя на
  // стыке месяцев считается по своему первому дню: это ровно тот месяц, за
  // который начальник в этот момент закрывает долю.
  const crmMonth = vnMonth(range.fromDay.slice(0, 7));
  const [confirmedRes, agentsRes, crm] = await Promise.all([
    supabase
      .from("referral_rewards")
      .select("referrer_id, amount")
      .eq("referrer_type", "agent")
      .eq("status", "confirmed")
      .gte("confirmed_at", range.fromIso)
      .lt("confirmed_at", range.toIso),
    supabase.from("agents").select("id, user:users!user_id(name)"),
    getCrmPayout(supabase, crmMonth),
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

  // «Итого к выплате» = деньги, которые школа раздаёт по итогам ВЫБРАННОГО
  // периода. Доля за CRM входит в него только когда выбран ровно её месяц:
  // иначе к недельной выплате приплюсовывалась бы месячная сумма, и цифра в
  // шапке не сходилась бы ни с чем.
  const crmInTotal =
    range.fromDay === crmMonth.fromDay && range.toDay === crmMonth.toDay;
  const grandTotal =
    instructors.reduce((s, i) => s + i.total, 0) +
    agents.reduce((s, a) => s + a.total, 0) +
    (crmInTotal ? crm.total : 0);

  // «Уже выдано» — только выплаты, целиком лежащие ВНУТРИ выбранного периода:
  // отметка за 1–5 честно входит в месяц, а месячная отметка не приплюсуется к
  // недельному экрану, где ей взяться неоткуда.
  const paidOutTotal = instructors.reduce(
    (s, i) =>
      s +
      i.payouts
        .filter((p) => p.from >= range.fromDay && p.to <= lastDay)
        .reduce((sum, p) => sum + p.amount, 0),
    0,
  );

  const blockedNames = instructors.filter((i) => i.blocked).map((i) => i.name);

  return {
    instructors,
    agents,
    crm,
    crmMonthLabel: crmMonth.label,
    crmInTotal,
    grandTotal,
    paidOutTotal,
    blockedNames,
  };
}
