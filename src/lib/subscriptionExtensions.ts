import type { createClient } from "@/lib/supabase/server";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { StatsRange } from "@/lib/stats";
import { failIfReadError } from "@/lib/dbError";

// Продление абонемента за доплату (0062, решения David от 22.09.2026).
//
// Действующий абонемент продлевается на 3 месяца за 1 000 000 ₫. Цена зашита
// здесь, а не приходит из формы: инструктор не должен вписывать свою сумму.
// Бонусные +30 минут к продлению пока не начисляются — ждут уточнения у
// начальника.
//
// ДЕНЬГИ ПРОДЛЕНИЯ = ДЕНЬГИ ПРОДАЖИ АБОНЕМЕНТА. 35% Marina, 2% CRM и 15% в
// котёл сменщиков дня оплаты считаются с него так же, как с проданного
// абонемента. Поэтому все денежные экраны читают оплаченные абонементы через
// loadPaidSubscriptionMoney — обе таблицы разом, одинаковыми колонками.
// Читать subscriptions напрямую там, где считаются деньги, значит потерять
// продления.

export const EXTENSION_PRICE = 1_000_000;
export const EXTENSION_MONTHS = 3;

type Client =
  | Awaited<ReturnType<typeof createClient>>
  | ReturnType<typeof createAdminClient>;

/**
 * Оплаченные в периоде абонементы и продления одним списком.
 *
 * `columns` — общие для обеих таблиц колонки (price, paid_at, sold_by,
 * pool_share, payment_methods(name)). У строк продления стоит
 * `extension: true`: справке «сам продал N абонементов» продление не
 * абонемент, а в деньгах разницы нет.
 */
export async function loadPaidSubscriptionMoney<T extends object>(
  client: Client,
  columns: string,
  range: Pick<StatsRange, "fromIso" | "toIso">,
): Promise<(T & { extension: boolean })[]> {
  const [subsRes, extRes] = await Promise.all([
    client
      .from("subscriptions")
      .select(columns)
      .not("paid_at", "is", null)
      .gte("paid_at", range.fromIso)
      .lt("paid_at", range.toIso),
    client
      .from("subscription_extensions")
      .select(columns)
      .gte("paid_at", range.fromIso)
      .lt("paid_at", range.toIso),
  ]);
  failIfReadError(subsRes.error, "не удалось прочитать оплаченные абонементы");
  failIfReadError(extRes.error, "не удалось прочитать продления абонементов");

  return [
    ...((subsRes.data ?? []) as unknown as T[]).map((r) => ({ ...r, extension: false })),
    ...((extRes.data ?? []) as unknown as T[]).map((r) => ({ ...r, extension: true })),
  ];
}

// Вызывать только после проверки активного пользователя; actorId — из сессии.
export async function extendSubscription(
  admin: ReturnType<typeof createAdminClient>,
  input: {
    subscriptionId: string;
    paymentMethodId: string;
    actorId: string;
    poolShare: boolean;
  },
): Promise<{ expiresAt: string; error: null } | { error: string }> {
  const { data, error } = await admin.rpc("extend_subscription", {
    p_subscription_id: input.subscriptionId,
    p_price: EXTENSION_PRICE,
    p_payment_method_id: input.paymentMethodId,
    p_actor_id: input.actorId,
    p_pool_share: input.poolShare,
  });
  if (error) return { error: `Не удалось продлить: ${error.message}` };
  if (typeof data !== "string") {
    throw new Error("База не подтвердила продление. Проверьте срок абонемента перед повтором.");
  }
  return { expiresAt: data, error: null };
}
