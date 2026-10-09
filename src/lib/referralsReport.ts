import type { createAdminClient } from "@/lib/supabase/admin";
import { failIfReadError } from "@/lib/dbError";
import { selectIn } from "@/lib/clientList";
import { BONUS_SERVICE_CODE } from "@/lib/referralTerms";
import { vnDay } from "@/lib/dates";

// Вкладка «Рефералы» (09.10.2026, заменила «Агентов»): кто из членов клуба
// кого привёл, что друг взял первым и сколько минут за это начислено,
// потрачено и осталось. Видят админ, dev и СММщик — в одинаковом составе.
//
// Читаем service-role клиентом: награды и бонусные траты RLS отдаёт не всем
// офисным ролям, а экран у троих один. Роль проверяет вызывающий экран.

type Admin = ReturnType<typeof createAdminClient>;

export interface ReferralFriend {
  id: string;
  name: string;
  phone: string | null;
  /** Когда карточка друга появилась — по сути, первая запись по ссылке. */
  since: string;
  /** Первая покупка: название услуги или «Абонемент»; null — ещё ничего. */
  firstBuy: string | null;
  /** Минуты рефу за этого друга (0 — первая покупка без награды). */
  minutes: number;
  /** pending — абонемент продан в долг, минуты ждут оплаты. */
  pending: boolean;
}

export interface Referrer {
  id: string;
  name: string;
  phone: string | null;
  refCode: string | null;
  member: boolean;
  friends: ReferralFriend[];
  earned: number;
  pending: number;
  spent: number;
  left: number;
}

export interface ReferralsReport {
  referrers: Referrer[];
  totals: {
    members: number;
    friends: number;
    bought: number;
    rewarded: number;
    firstSubscription: number;
    earned: number;
    spent: number;
    left: number;
  };
}

const PAGE = 1000;

// Вся выборка постранично: .limit молча обрезал бы список (см. lib/clients).
async function readAll<T>(
  run: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
  what: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await run(from, from + PAGE - 1);
    failIfReadError(error, `не удалось прочитать ${what}`);
    rows.push(...((data ?? []) as T[]));
    if ((data ?? []).length < PAGE) break;
  }
  return rows;
}

export async function loadReferralsReport(admin: Admin): Promise<ReferralsReport> {
  const [friendsRaw, rewards, memberships, bonusSessions] = await Promise.all([
    readAll<{ id: string; name: string; phone: string | null; referrer_id: string; created_at: string }>(
      (a, b) =>
        admin
          .from("clients")
          .select("id, name, phone, referrer_id, created_at")
          .eq("referrer_type", "member")
          .not("referrer_id", "is", null)
          .order("id")
          .range(a, b),
      "приглашённых",
    ),
    readAll<{ referrer_id: string; client_id: string | null; amount: number; status: string }>(
      (a, b) =>
        admin
          .from("referral_rewards")
          .select("referrer_id, client_id, amount, status")
          .eq("referrer_type", "member")
          .eq("reward_type", "minutes")
          .order("id")
          .range(a, b),
      "награды за приглашения",
    ),
    readAll<{ client_id: string }>(
      (a, b) => admin.from("memberships").select("client_id").order("id").range(a, b),
      "членов клуба",
    ),
    readAll<{ client_id: string | null; minutes_used: number | null }>(
      (a, b) =>
        admin
          .from("sessions")
          .select("client_id, minutes_used, services!inner(code)")
          .eq("services.code", BONUS_SERVICE_CODE)
          .order("id")
          .range(a, b),
      "траты бонусных минут",
    ),
  ]);

  const friendIds = friendsRaw.map((f) => f.id);
  const spentBy = new Map<string, number>();
  for (const s of bonusSessions) {
    if (!s.client_id) continue;
    spentBy.set(s.client_id, (spentBy.get(s.client_id) ?? 0) + Number(s.minutes_used ?? 0));
  }

  // Реф — тот, у кого есть друзья, награды или бонусные траты: так в списке
  // остаются и те, кто приглашал по прежним условиям.
  const referrerIds = [
    ...new Set([
      ...friendsRaw.map((f) => f.referrer_id),
      ...rewards.map((r) => r.referrer_id),
      ...spentBy.keys(),
    ]),
  ];

  const [referrerCards, friendSessions, friendSubs] = await Promise.all([
    selectIn<{ id: string; name: string; phone: string | null; ref_code: string | null }>(
      referrerIds,
      (chunk) => admin.from("clients").select("id, name, phone, ref_code").in("id", chunk),
    ),
    selectIn<{ client_id: string; date: string; services: { name: string } | null }>(
      friendIds,
      (chunk) =>
        admin
          .from("sessions")
          .select("client_id, date, services(name)")
          .in("client_id", chunk),
    ),
    // У абонемента нет created_at — день покупки это sold_at.
    selectIn<{ client_id: string; sold_at: string }>(friendIds, (chunk) =>
      admin.from("subscriptions").select("client_id, sold_at").in("client_id", chunk),
    ),
  ]);

  // Первая покупка друга — самая ранняя по дню: занятие (date) или абонемент
  // (день sold_at по Вьетнаму). Сравниваем дни, а не метки времени: занятие
  // могут внести задним числом, и время внесения тут ни о чём не говорит.
  const firstBuy = new Map<string, { at: string; label: string }>();
  const consider = (clientId: string, at: string, label: string) => {
    const cur = firstBuy.get(clientId);
    if (!cur || at < cur.at) firstBuy.set(clientId, { at, label });
  };
  for (const s of friendSessions) consider(s.client_id, s.date, s.services?.name ?? "Занятие");
  for (const s of friendSubs) consider(s.client_id, vnDay(s.sold_at), "Абонемент");

  const rewardOf = new Map<string, { amount: number; status: string }>();
  for (const r of rewards) {
    if (r.client_id) rewardOf.set(r.client_id, { amount: Number(r.amount), status: r.status });
  }
  const member = new Set(memberships.map((m) => m.client_id));
  const cardById = new Map(referrerCards.map((c) => [c.id, c]));

  const referrers: Referrer[] = referrerIds.map((id) => {
    const card = cardById.get(id);
    const friends: ReferralFriend[] = friendsRaw
      .filter((f) => f.referrer_id === id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((f) => {
        const reward = rewardOf.get(f.id);
        return {
          id: f.id,
          name: f.name,
          phone: f.phone,
          since: f.created_at,
          firstBuy: firstBuy.get(f.id)?.label ?? null,
          minutes: reward?.amount ?? 0,
          pending: reward?.status === "pending",
        };
      });
    const mine = rewards.filter((r) => r.referrer_id === id);
    const earned = mine
      .filter((r) => r.status === "confirmed")
      .reduce((s, r) => s + Number(r.amount), 0);
    const pending = mine
      .filter((r) => r.status === "pending")
      .reduce((s, r) => s + Number(r.amount), 0);
    const spent = spentBy.get(id) ?? 0;
    return {
      id,
      name: card?.name ?? "Клиент удалён",
      phone: card?.phone ?? null,
      refCode: card?.ref_code ?? null,
      member: member.has(id),
      friends,
      earned,
      pending,
      spent,
      // Та же формула, что у функции базы bonus_minutes_left.
      left: earned - spent,
    };
  });
  // Сверху — кто привёл больше всех.
  referrers.sort(
    (a, b) => b.friends.length - a.friends.length || b.earned - a.earned,
  );

  const all = referrers.flatMap((r) => r.friends);
  return {
    referrers,
    totals: {
      members: member.size,
      friends: all.length,
      bought: all.filter((f) => f.firstBuy !== null).length,
      rewarded: all.filter((f) => f.minutes > 0 && !f.pending).length,
      firstSubscription: all.filter((f) => f.firstBuy === "Абонемент").length,
      earned: referrers.reduce((s, r) => s + r.earned, 0),
      spent: referrers.reduce((s, r) => s + r.spent, 0),
      left: referrers.reduce((s, r) => s + r.left, 0),
    },
  };
}
