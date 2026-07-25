import type { createClient } from "@/lib/supabase/server";
import type { createAdminClient } from "@/lib/supabase/admin";

// «Занять заявку» — защита от того, что одну заявку оформят дважды.
//
// Простыми словами. Заявку может закрыть и админ, и инструктор. Раньше код
// делал так: прочитал статус заявки → увидел, что она ещё не «done» → сделал
// всю работу → в конце пометил «done». Между «прочитал» и «пометил» проходит
// секунда-другая, и если в этот момент ту же заявку оформляет второй человек с
// другого устройства, оба видят «ещё не оформлена» и оба доводят дело до конца.
// Итог: два занятия вместо одного (задвоенная выручка и 15% инструктору) и две
// награды агенту по 300 000 ₫. Кнопка в форме блокируется на время отправки,
// поэтому двойной клик не страшен — страшны именно два устройства сразу.
//
// Как чиним. Пометку «done» ставим НЕ в конце, а перед записью занятия, и
// одним запросом с условием «...и только если статус ещё не done». База
// выполняет такие запросы по одному, поэтому строку изменит ровно один из
// двоих. Второму вернётся ноль строк — он поймёт, что опоздал, и ничего не
// запишет. Это и называется «атомарный захват»: проверка и пометка — одно
// неделимое действие, влезть между ними невозможно.
//
// Если после захвата работа сорвалась (например, база не приняла занятие),
// заявку надо вернуть как было — для этого releaseBooking.

// Инструкторские экшены ходят service_role-клиентом (0030), админские — своим:
// у админа прав на заявки хватает. Логика захвата от этого не меняется.
type Supabase =
  | Awaited<ReturnType<typeof createClient>>
  | ReturnType<typeof createAdminClient>;

// Поля заявки, которые захват перезаписывает. Читаем их заранее, чтобы при
// откате вернуть ровно прежние значения, а не угадывать.
export interface BookingClaimState {
  status: string;
  client_id: string | null;
  payment_method_id: string | null;
}

export interface ClaimResult {
  claimed: boolean;
  /** Заполнено, только если запрос вообще не прошёл (проблема с базой). */
  error?: string;
}

/**
 * Пометить заявку выполненной, если её ещё никто не пометил.
 * claimed=false означает «нас опередили» — работу продолжать нельзя.
 */
export async function claimBooking(
  supabase: Supabase,
  bookingId: string,
  patch: { client_id: string; payment_method_id: string | null },
): Promise<ClaimResult> {
  const { data, error } = await supabase
    .from("bookings")
    .update({ status: "done", ...patch })
    .eq("id", bookingId)
    .neq("status", "done")
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[bookingClaim] claim error:", error.message);
    return { claimed: false, error: error.message };
  }
  return { claimed: Boolean(data) };
}

/**
 * Вернуть заявку в то состояние, в котором она была до захвата. Зовём, только
 * если после успешного захвата работа не доделалась.
 */
export async function releaseBooking(
  supabase: Supabase,
  bookingId: string,
  previous: BookingClaimState,
): Promise<void> {
  const { error } = await supabase
    .from("bookings")
    .update({
      status: previous.status,
      client_id: previous.client_id,
      payment_method_id: previous.payment_method_id,
    })
    .eq("id", bookingId);
  // Не кидаем: вызывающий и так возвращает пользователю ошибку по своей
  // причине, а заявка в худшем случае осталась помеченной выполненной —
  // это видно в ленте и правится админом руками.
  if (error) console.error("[bookingClaim] release error:", error.message);
}
