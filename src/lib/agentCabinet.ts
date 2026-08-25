import type { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { failIfReadError } from "@/lib/dbError";
import { asAgentPlan, type AgentPlan } from "@/lib/agentTerms";
import type { StatsRange } from "@/lib/stats";

// Данные кабинета агента (0049, решение David от 25.08.2026).
//
// Агент видит РОВНО своё: переходы по своей ссылке, людей, которых он привёл,
// свои награды и свои выплаты. Ни выручки школы, ни чужих агентов, ни чеков
// клиентов здесь нет — заработок агента считается от его награды, а не от того,
// сколько человек оставил в кассе.
//
// Откуда что читается:
//   • agents, ref_visits, referral_rewards, agent_payouts — обычным клиентом,
//     под политиками 0049: база сама не отдаст ему чужую строку;
//   • clients и bookings — под service_role, потому что в них лежат телефоны и
//     внутренние заметки школы, а RLS отдаёт строку ЦЕЛИКОМ. Отбор строгий: по
//     agentId и ref_code, взятым из его же профиля, наружу уходят только имя и
//     дата.
//
// Деньги «к выплате» считаются за всё время, а не за выбранный период — как
// «осталось выдать» в /admin/payroll: сальдо не должно меняться от того, как
// нарезать календарь.

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface AgentProfile {
  id: string; // agents.id
  refCode: string;
  active: boolean;
  plan: AgentPlan;
}

/** Один приведённый человек — строка списка «кто от меня пришёл». */
export interface AgentClientRow {
  id: string;
  name: string;
  createdAt: string;
  /** Дошёл до услуги: за него начислена награда. */
  rewarded: boolean;
  /** Сколько агент за него получил (0 — пока не дошёл). */
  reward: number;
}

export interface AgentStats {
  // ── Воронка за выбранный период ────────────────────────────────────────────
  visits: number; // переходов по ссылке
  bookings: number; // заявок с формы по его коду
  clients: number; // людей закрепилось за агентом
  rewardCount: number; // из них дошли до услуги
  earned: number; // начислено наград за период
  paid: number; // выдано за период
  // ── Накопительно, за всё время ─────────────────────────────────────────────
  earnedTotal: number;
  paidTotal: number;
  /** Заработано минус выдано. Минус — выплатили авансом, так и показываем. */
  due: number;
  clientsTotal: number;
  /** Приведённые люди за период, свежие сверху. */
  clientRows: AgentClientRow[];
}

/** Одна выплата в истории кабинета. */
export interface AgentPayoutRow {
  id: string;
  amount: number;
  paidOn: string;
  comment: string | null;
}

// Профиль агента по его строке в users. null — у человека роль agent, а строки
// агента нет: так бывает, если аккаунт завели руками. Кабинет в этом случае
// говорит об этом прямо, а не показывает нули.
export async function getAgentProfile(
  supabase: Supabase,
  userId: string,
): Promise<AgentProfile | null> {
  const { data, error } = await supabase
    .from("agents")
    .select("id, ref_code, active, terms_plan")
    .eq("user_id", userId)
    .maybeSingle();

  failIfReadError(error, "не удалось прочитать профиль агента");
  if (!data) return null;

  return {
    id: data.id as string,
    refCode: data.ref_code as string,
    active: Boolean(data.active),
    plan: asAgentPlan(data.terms_plan),
  };
}

export async function getAgentStats(
  supabase: Supabase,
  agent: AgentProfile,
  range: StatsRange,
): Promise<AgentStats> {
  // Клиенты и заявки — под service_role: см. заголовок файла.
  const admin = createAdminClient();

  const [visitsRes, rewardsRes, payoutsRes, clientsRes, bookingsRes] =
    await Promise.all([
      supabase
        .from("ref_visits")
        .select("created_at")
        .eq("code", agent.refCode)
        .gte("created_at", range.fromIso)
        .lt("created_at", range.toIso),
      // Награды за всё время: из них считаются и период, и накопительный итог.
      // Строк тут единицы в неделю — разбивать на два запроса незачем.
      supabase
        .from("referral_rewards")
        .select("client_id, amount, status, confirmed_at")
        .eq("referrer_type", "agent")
        .eq("referrer_id", agent.id),
      supabase
        .from("agent_payouts")
        .select("amount, paid_on")
        .eq("agent_id", agent.id),
      admin
        .from("clients")
        .select("id, name, created_at")
        .eq("referrer_type", "agent")
        .eq("referrer_id", agent.id),
      admin
        .from("bookings")
        .select("created_at")
        .eq("ref_code", agent.refCode)
        .gte("created_at", range.fromIso)
        .lt("created_at", range.toIso),
    ]);

  // Ноль в деньгах должен быть фактом, а не последствием сбойного запроса
  // (lib/dbError): «мне ничего не начислили» — слишком серьёзное заявление.
  failIfReadError(rewardsRes.error, "не удалось прочитать награды");
  failIfReadError(payoutsRes.error, "не удалось прочитать выплаты");
  failIfReadError(clientsRes.error, "не удалось прочитать клиентов");

  const inRange = (iso: string | null) =>
    Boolean(iso && iso >= range.fromIso && iso < range.toIso);

  // Награда пишется сразу confirmed (занятие оформляют по факту оплаты), но
  // прочие статусы в заработок не берём: деньги обещаны только за подтверждённое.
  const rewards = (rewardsRes.data ?? []).filter((r) => r.status === "confirmed");
  const rewardByClient = new Map<string, number>();
  let earned = 0;
  let earnedTotal = 0;
  let rewardCount = 0;
  for (const r of rewards) {
    const amount = Number(r.amount ?? 0);
    earnedTotal += amount;
    if (inRange(r.confirmed_at as string | null)) {
      earned += amount;
      rewardCount += 1;
    }
    const clientId = r.client_id as string | null;
    if (clientId) {
      rewardByClient.set(clientId, (rewardByClient.get(clientId) ?? 0) + amount);
    }
  }

  const lastDay = lastDayOf(range);
  let paid = 0;
  let paidTotal = 0;
  for (const p of payoutsRes.data ?? []) {
    const amount = Number(p.amount ?? 0);
    paidTotal += amount;
    const day = p.paid_on as string;
    if (day >= range.fromDay && day <= lastDay) paid += amount;
  }

  const allClients = clientsRes.data ?? [];
  const clientRows: AgentClientRow[] = allClients
    .filter((c) => inRange(c.created_at as string))
    .map((c) => ({
      id: c.id as string,
      name: (c.name as string) ?? "без имени",
      createdAt: c.created_at as string,
      rewarded: rewardByClient.has(c.id as string),
      reward: rewardByClient.get(c.id as string) ?? 0,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    visits: (visitsRes.data ?? []).length,
    bookings: (bookingsRes.data ?? []).length,
    clients: clientRows.length,
    rewardCount,
    earned,
    paid,
    earnedTotal,
    paidTotal,
    due: earnedTotal - paidTotal,
    clientsTotal: allClients.length,
    clientRows,
  };
}

// История выплат агенту, свежее сверху. Способ оплаты (наличные / перевод) не
// показываем: справочник payment_methods агенту по RLS не виден, а знать, из
// какой кассы ему отдали деньги, ему и не нужно.
export async function getAgentPayouts(
  supabase: Supabase,
  agentId: string,
): Promise<AgentPayoutRow[]> {
  const { data, error } = await supabase
    .from("agent_payouts")
    .select("id, amount, paid_on, comment")
    .eq("agent_id", agentId)
    .order("paid_on", { ascending: false });

  failIfReadError(error, "не удалось прочитать выплаты");
  return (data ?? []).map((p) => ({
    id: p.id as string,
    amount: Number(p.amount ?? 0),
    paidOn: p.paid_on as string,
    comment: (p.comment as string | null) ?? null,
  }));
}

// Последний день периода включительно: в StatsRange правая граница
// эксклюзивная, а выплаты живут в «человеческих» датах (как в lib/payroll).
function lastDayOf(range: StatsRange): string {
  const d = new Date(`${range.toDay}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
