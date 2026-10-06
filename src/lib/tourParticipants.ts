import type { createClient } from "@/lib/supabase/server";
import type { createAdminClient } from "@/lib/supabase/admin";
import { isValidPhone, PHONE_ERROR } from "@/lib/phone";

// Участники тура кроме контактного лица (0066). Форма шлёт их парами полей
// participantName / participantPhone — по строке на человека. Клиента по
// телефону находит или заводит сам экшен (у админа и инструктора это разные
// функции), здесь — только разбор формы и запись связи.

type Supabase =
  | Awaited<ReturnType<typeof createClient>>
  | ReturnType<typeof createAdminClient>;

export interface ParticipantInput {
  name: string;
  phone: string;
}

/** Строки участников из формы. Пустые строки пропускаем, недозаполненные — ошибка. */
export function readParticipants(
  formData: FormData,
): { rows: ParticipantInput[] } | { error: string } {
  const names = formData.getAll("participantName").map((v) => String(v).trim());
  const phones = formData.getAll("participantPhone").map((v) => String(v).trim());
  const rows: ParticipantInput[] = [];
  for (let i = 0; i < Math.max(names.length, phones.length); i++) {
    const name = names[i] ?? "";
    const phone = phones[i] ?? "";
    if (!name && !phone) continue;
    if (!name || !phone) {
      return { error: "У каждого участника нужны имя и телефон — или удалите пустую строку." };
    }
    if (!isValidPhone(phone)) return { error: `Участник «${name}»: ${PHONE_ERROR}` };
    rows.push({ name, phone });
  }
  return { rows };
}

/**
 * Привязать участников к туру. Контактное лицо и повторы отбрасываем: один
 * человек — одна строка. Ошибку не кидаем: тур уже записан, и «не сохранилось»
 * толкнуло бы оформить его второй раз — получили бы дубль чека и фикса.
 */
export async function linkParticipants(
  db: Supabase,
  sessionId: string,
  contactId: string,
  clientIds: string[],
): Promise<void> {
  const unique = [...new Set(clientIds)].filter((id) => id !== contactId);
  if (unique.length === 0) return;
  const { error } = await db
    .from("session_participants")
    .upsert(
      unique.map((client_id) => ({ session_id: sessionId, client_id })),
      { onConflict: "session_id,client_id", ignoreDuplicates: true },
    );
  if (error) console.error("[tours] participants link error:", error.message);
}
