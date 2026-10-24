import type { createAdminClient } from "@/lib/supabase/admin";
import { failIfReadError } from "@/lib/dbError";

// История зачислений агенту «по формуле» (просьба начальника, 24.10.2026):
// за что именно начислено, сколько заплатил клиент, сколько получил агент и с
// какой суммы школа считала свои проценты. Видна в карточке агента у админа и
// в кабинете самого агента (там без базы процентов — это кухня школы).
//
// Награда (referral_rewards) привязана к клиенту, а не к покупке. Покупку
// находим по клиенту и сумме: у занятия она лежит в sessions.agent_commission,
// у абонемента — в subscriptions.agent_commission (0072). Агенту платят один
// раз за клиента, поэтому совпадение почти всегда единственное; если нет —
// строка всё равно показывается, просто без чека.
//
// Читает service-role клиентом: в sessions, subscriptions и clients лежат
// чужие чеки и телефоны. Вызывать только после проверки роли, agentIds — из
// своего профиля агента или из списка агентов в кабинете офиса.

type Admin = ReturnType<typeof createAdminClient>;

export interface AgentRewardRow {
  id: string;
  /** День начисления (оплаты), а пока ждёт оплаты — день продажи. */
  day: string | null;
  clientName: string;
  /** Что купил клиент: название услуги или «Абонемент». */
  what: string;
  /** Сколько заплатил клиент; null — покупку не нашли. */
  check: number | null;
  /** Сколько начислено агенту. */
  reward: number;
  /** С какой суммы школа считала 35% / 15% / 2%; null — покупку не нашли. */
  base: number | null;
  /** Абонемент продан в долг — награда ждёт оплаты. */
  pending: boolean;
}

interface Purchase {
  clientId: string;
  day: string;
  what: string;
  check: number;
  commission: number;
  base: number;
}

export async function loadAgentRewardHistory(
  admin: Admin,
  agentIds: string[],
): Promise<Map<string, AgentRewardRow[]>> {
  const result = new Map<string, AgentRewardRow[]>();
  if (agentIds.length === 0) return result;

  const { data: rewards, error } = await admin
    .from("referral_rewards")
    .select("id, referrer_id, client_id, amount, status, confirmed_at")
    .eq("referrer_type", "agent")
    .in("referrer_id", agentIds)
    .in("status", ["confirmed", "pending"]);
  failIfReadError(error, "не удалось прочитать награды агентов");
  if (!rewards || rewards.length === 0) return result;

  const clientIds = [
    ...new Set(rewards.map((r) => r.client_id as string | null).filter(Boolean) as string[]),
  ];
  const [clientsRes, sessionsRes, subsRes] = await Promise.all([
    admin.from("clients").select("id, name").in("id", clientIds),
    admin
      .from("sessions")
      .select("client_id, date, amount, agent_commission, service:services(name)")
      .in("client_id", clientIds)
      .gt("agent_commission", 0),
    admin
      .from("subscriptions")
      .select("client_id, sold_at, paid_at, price, agent_commission, agent_base_cut")
      .in("client_id", clientIds)
      .gt("agent_commission", 0),
  ]);
  failIfReadError(clientsRes.error, "не удалось прочитать клиентов агентов");
  failIfReadError(sessionsRes.error, "не удалось прочитать занятия агентов");
  failIfReadError(subsRes.error, "не удалось прочитать абонементы агентов");

  const names = new Map(
    (clientsRes.data ?? []).map((c) => [c.id as string, (c.name as string) ?? "без имени"]),
  );

  // Все покупки с комиссией агента — занятия и абонементы одним списком.
  const purchases: Purchase[] = [
    ...(sessionsRes.data ?? []).map((s) => {
      const check = Number(s.amount ?? 0);
      const commission = Number(s.agent_commission ?? 0);
      return {
        clientId: s.client_id as string,
        day: s.date as string,
        what: (s.service as unknown as { name: string } | null)?.name ?? "Занятие",
        check,
        commission,
        base: Math.max(0, check - commission),
      };
    }),
    ...(subsRes.data ?? []).map((s) => {
      const check = Number(s.price ?? 0);
      return {
        clientId: s.client_id as string,
        day: ((s.paid_at ?? s.sold_at) as string).slice(0, 10),
        what: "Абонемент",
        check,
        commission: Number(s.agent_commission ?? 0),
        base: Math.max(0, check - Number(s.agent_base_cut ?? 0)),
      };
    }),
  ];

  const used = new Set<Purchase>();
  for (const r of rewards) {
    const clientId = r.client_id as string | null;
    const reward = Number(r.amount ?? 0);
    const match = purchases.find(
      (p) => !used.has(p) && p.clientId === clientId && p.commission === reward,
    );
    if (match) used.add(match);
    const row: AgentRewardRow = {
      id: r.id as string,
      day: ((r.confirmed_at as string | null)?.slice(0, 10) ?? match?.day) || null,
      clientName: (clientId && names.get(clientId)) || "клиент удалён",
      what: match?.what ?? "покупка не найдена",
      check: match?.check ?? null,
      reward,
      base: match?.base ?? null,
      pending: r.status === "pending",
    };
    const agentId = r.referrer_id as string;
    result.set(agentId, [...(result.get(agentId) ?? []), row]);
  }

  // Свежие сверху.
  for (const rows of result.values()) {
    rows.sort((a, b) => (b.day ?? "").localeCompare(a.day ?? ""));
  }
  return result;
}
