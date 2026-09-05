import type { createAdminClient } from "@/lib/supabase/admin";

// Вызывать только после проверки активного пользователя; actorId — из сессии.
// Не добавлять fallback на INSERT: он вернёт гонку и обход проверки остатка.
export async function writeOffSubscription(
  supabase: ReturnType<typeof createAdminClient>,
  input: {
    subscriptionId: string;
    minutes: number;
    date: string;
    instructorId: string | null;
    actorId: string;
    note: string | null;
  },
): Promise<{ left: number; error: null } | { error: string }> {
  if (!Number.isSafeInteger(input.minutes) || input.minutes <= 0 || input.minutes > 2147483647) {
    return { error: "Минуты — целое число больше нуля в допустимом диапазоне." };
  }
  const { data, error } = await supabase.rpc("write_off_subscription", {
    p_subscription_id: input.subscriptionId,
    p_minutes: input.minutes,
    p_date: input.date,
    p_instructor_id: input.instructorId,
    p_actor_id: input.actorId,
    p_note: input.note,
  });
  if (error) return { error: `Не удалось списать: ${error.message}` };
  const left = Number(data?.[0]?.left_minutes);
  if (data?.length !== 1 || data[0].left_minutes == null || !Number.isSafeInteger(left) || left < 0) {
    throw new Error("База не подтвердила результат списания. Проверьте историю перед повтором.");
  }
  return { left, error: null };
}
