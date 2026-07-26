import type { createClient } from "@/lib/supabase/server";
import type { PaymentClaim } from "@/lib/paymentClaim";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface ClaimInfo {
  claim: PaymentClaim;
  note: string | null;
  at: string | null;
  by: string | null; // имя того, кто оставил заявление
}

// Заявления об оплате (0032) отдельным запросом, а не полем в основной выборке.
// Причина простая: миграции David накатывает руками уже после деплоя, и колонка
// в списке select'а уронила бы весь экран абонементов до наката — с текстом
// «У клиента нет активного абонемента» вместо живого списка. Здесь же ошибка
// означает ровно «заявлений пока не бывает», и страница работает как раньше.
export async function loadPaymentClaims(
  supabase: Supabase,
  ids: string[],
): Promise<Map<string, ClaimInfo>> {
  const map = new Map<string, ClaimInfo>();
  if (ids.length === 0) return map;

  const { data, error } = await supabase
    .from("subscriptions")
    .select(
      "id, payment_claim, payment_claim_note, payment_claim_at, claimant:users!payment_claim_by(name)",
    )
    .in("id", ids)
    .not("payment_claim", "is", null);
  if (error || !data) return map;

  for (const row of data as unknown as {
    id: string;
    payment_claim: PaymentClaim | null;
    payment_claim_note: string | null;
    payment_claim_at: string | null;
    claimant: { name: string } | null;
  }[]) {
    if (!row.payment_claim) continue;
    map.set(row.id, {
      claim: row.payment_claim,
      note: row.payment_claim_note,
      at: row.payment_claim_at,
      by: row.claimant?.name ?? null,
    });
  }
  return map;
}

// Остаток минут абонемента (архитектура + этап 4):
//   total_minutes + сумма ручных корректировок − сумма списаний.
// Корректировки (subscription_adjustments) — правки админа/инструктора
// с обязательным комментарием; списания — сессии с этим subscription_id.
export async function minutesLeft(
  supabase: Supabase,
  sub: { id: string; total_minutes: number },
): Promise<number> {
  const [used, adj] = await Promise.all([
    supabase
      .from("sessions")
      .select("minutes_used")
      .eq("subscription_id", sub.id),
    supabase
      .from("subscription_adjustments")
      .select("delta_minutes")
      .eq("subscription_id", sub.id),
  ]);
  const usedSum = (used.data ?? []).reduce((s, r) => s + (r.minutes_used ?? 0), 0);
  const adjSum = (adj.data ?? []).reduce((s, r) => s + (r.delta_minutes ?? 0), 0);
  return sub.total_minutes + adjSum - usedSum;
}
