import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

// Членство в клубе даёт ПОКУПКА абонемента — просьба начальника от 22.10.2026.
//
// История: 09.09.2026 членство уже заводила продажа, 22.09.2026 его перенесли
// на откатанный абонемент (миграция 0061), 22.10.2026 вернули на покупку —
// чтобы клиент сразу был в клубе и со звездой в «Клиентах». Блок в 0061
// остался: уже вступившему он ничего не меняет.
//
// Почему служебным ключом. RLS-политика вставки для инструктора снесена той же
// 0031 и возвращать её ради одной строки не нужно: инструктор и сам абонемент
// пишет service_role-клиентом, а право продавать проверено выше по стеку
// (requireStaff / requireOffice). Поэтому функция ПРИНИМАЕТ admin-клиент, а не
// создаёт его сама — вызывающий уже держит проверенного пользователя в руках.

export type MembershipResult = "created" | "existed" | "failed";

/**
 * Завести членство клиенту, если его ещё нет.
 *
 * Идемпотентна: у memberships.client_id стоит UNIQUE, и второй абонемент того
 * же человека дубля не создаст — вставка просто ничего не сделает.
 *
 * @param since дата вступления в клуб. Для продажи задним числом это дата
 *   продажи, а не «сейчас»: иначе у старожила в карточке будет написано, что
 *   он в клубе с сегодняшнего дня. Пустое значение оставляет default базы.
 */
export async function ensureMembership(
  admin: Admin,
  clientId: string,
  since?: string | null,
): Promise<MembershipResult> {
  if (!clientId) return "failed";

  const row: { client_id: string; since?: string } = { client_id: clientId };
  if (since) row.since = since;

  const { data, error } = await admin
    .from("memberships")
    .upsert(row, { onConflict: "client_id", ignoreDuplicates: true })
    .select("id");

  if (error) {
    // Намеренно не роняем продажу: деньги важнее статуса. Не записавшееся
    // членство добьёт scripts/backfill-memberships.mjs или кнопка «Принять в
    // клуб» у админа, а вот потерянный абонемент восстанавливать нечем.
    console.error("[memberships] не удалось завести членство:", error.message);
    return "failed";
  }

  // ignoreDuplicates возвращает только реально вставленные строки: пустой
  // массив означает «клиент уже в клубе», а не ошибку.
  return (data?.length ?? 0) > 0 ? "created" : "existed";
}
