import { createAdminClient } from "@/lib/supabase/admin";
import {
  certificateStatus,
  normalizeCertificateCode,
} from "@/lib/certificateCode";

// Подарочные сертификаты (0059, решение David от 08.09.2026).
//
// Как это живёт. Админ заводит сертификат во вкладке «Сертификаты»: имя,
// телефон, услуга и номер — номер потом пишут на бумажном бланке от руки.
// Гость вводит его в форме записи, ему подставляется услуга сертификата, и
// заявка дальше идёт обычным порядком.
//
// Два правила начальника, из которых следует всё остальное:
//   • действует ТРИ МЕСЯЦА со дня создания (срок задаёт база, 0059);
//   • при использовании СГОРАЕТ — гасим в момент подачи заявки, а не после
//     занятия. Пока человек думает, номер иначе можно скормить форме сколько
//     угодно раз. Заявку отменили — админ вернёт сертификат в оборот кнопкой.
//
// Вся работа отсюда идёт служебным ключом: таблица закрыта RLS наглухо.

type Admin = ReturnType<typeof createAdminClient>;

// Почему номер не подошёл. Наружу, в форму гостя, уходит только это слово —
// ни имени владельца, ни телефона, ни срока.
export type CertificateProblem = "not_found" | "used" | "expired" | "db_error";

// Что за сертификат под этим номером. Только чтение — форма гостя спрашивает
// этим, пока он ещё печатает.
export async function lookupCertificate(
  supabase: Admin,
  rawCode: string,
): Promise<
  { ok: true; serviceId: string; serviceName: string } | { ok: false; reason: CertificateProblem }
> {
  const code = normalizeCertificateCode(rawCode);
  if (!code) return { ok: false, reason: "not_found" };

  const { data, error } = await supabase
    .from("certificates")
    .select("service_id, used_at, expires_at, services(name)")
    .eq("code", code)
    .maybeSingle();
  if (error) {
    console.error("[certificates] lookup error:", error.message);
    return { ok: false, reason: "db_error" };
  }
  if (!data) return { ok: false, reason: "not_found" };

  const row = data as unknown as {
    service_id: string;
    used_at: string | null;
    expires_at: string;
    services: { name: string } | null;
  };
  const status = certificateStatus(row);
  if (status !== "active") return { ok: false, reason: status };

  return {
    ok: true,
    serviceId: row.service_id,
    serviceName: row.services?.name ?? "занятие",
  };
}

// Погасить номер. Это и есть замок от повторного использования: условия
// «ещё не погашен» и «не просрочен» стоят в самом UPDATE, поэтому из двух
// одновременных заявок строку заберёт ровно одна, а вторая не найдёт её
// подходящей. Проверка отдельным запросом такой гарантии не даёт.
export async function redeemCertificate(
  supabase: Admin,
  rawCode: string,
): Promise<
  { ok: true; id: string; serviceId: string } | { ok: false; reason: CertificateProblem }
> {
  const code = normalizeCertificateCode(rawCode);
  if (!code) return { ok: false, reason: "not_found" };

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("certificates")
    .update({ used_at: now })
    .eq("code", code)
    .is("used_at", null)
    .gt("expires_at", now)
    .select("id, service_id")
    .maybeSingle();
  if (error) {
    console.error("[certificates] redeem error:", error.message);
    return { ok: false, reason: "db_error" };
  }
  if (data) {
    return { ok: true, id: data.id as string, serviceId: data.service_id as string };
  }

  // Не погасился — говорим человеку, почему именно.
  const found = await lookupCertificate(supabase, code);
  if (found.ok) return { ok: false, reason: "used" }; // забрали в соседней заявке
  return { ok: false, reason: found.reason };
}

/** Дописать заявку к уже погашенному сертификату. */
export async function linkCertificateBooking(
  supabase: Admin,
  certificateId: string,
  bookingId: string,
): Promise<void> {
  const { error } = await supabase
    .from("certificates")
    .update({ used_booking_id: bookingId })
    .eq("id", certificateId);
  if (error) console.error("[certificates] link booking error:", error.message);
}

// Вернуть сертификат в оборот. Нужен там, где погашение оказалось напрасным:
// заявку отменили, гость не пришёл, админ ошибся номером.
export async function releaseCertificate(
  supabase: Admin,
  certificateId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("certificates")
    .update({ used_at: null, used_booking_id: null })
    .eq("id", certificateId);
  if (error) {
    console.error("[certificates] release error:", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
