// Номер подарочного сертификата: как он выглядит, как приводится к единому
// виду и в каком он состоянии (0059).
//
// Отдельный файл от lib/certificates намеренно: этими функциями пользуется и
// форма в браузере (админ придумывает номер до сохранения, гость вводит его в
// заявке), а lib/certificates тянет за собой служебный клиент Supabase —
// такому в клиентской сборке делать нечего.

// Алфавит без похожих друг на друга знаков: номер читают с бумаги и диктуют
// по телефону, и «0/O» или «1/I» там превращаются в спор с гостем.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_BODY_LEN = 8;
const CODE_PREFIX = "FG";

/** Номер как его вводят и хранят: только заглавные буквы и цифры. */
export function normalizeCertificateCode(raw: unknown): string {
  return String(raw ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 32);
}

/** Как номер показываем и пишем на бланке: FG-7K3M-92QD. */
export function formatCertificateCode(code: string): string {
  const c = normalizeCertificateCode(code);
  if (c.length !== CODE_PREFIX.length + CODE_BODY_LEN) return c;
  return `${c.slice(0, 2)}-${c.slice(2, 6)}-${c.slice(6)}`;
}

// Придумать номер: FG + 8 знаков. Проверку на занятость делает база.
//
// Берём криптографический источник случайности (Web Crypto — он есть и в
// браузере, и в Node), а не Math.random. Причина не в теории: сертификат —
// документ на предъявителя, по нему школа проводит оплаченное занятие, а
// последовательность Math.random в V8 восстанавливается по нескольким уже
// выданным числам. Тогда, увидев пару своих номеров, человек предсказал бы
// следующие — и получил бы занятия, за которые не платил.
//
// В алфавите ровно 32 знака, а 256 делится на 32 нацело, поэтому остаток от
// байта распределён равномерно: перекоса в сторону первых букв здесь нет.
//
// Длина: 8 знаков — это 40 бит. Меньше, чем принято для ключей, и сознательно:
// номер пишут на бланке от руки и диктуют по телефону. Перебор закрыт другим —
// проверка номера ограничена пятью запросами в минуту с адреса
// (api/certificates/check), то есть подбор одного номера занял бы сотни тысяч
// лет. Удлинять номер стоит только вместе с отказом от ручной записи.
export function randomCertificateCode(): string {
  const bytes = new Uint8Array(CODE_BODY_LEN);
  crypto.getRandomValues(bytes);
  let body = "";
  for (const byte of bytes) body += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return `${CODE_PREFIX}${body}`;
}

export interface CertificateRow {
  used_at: string | null;
  expires_at: string;
}

/** Состояние сертификата — одно на все экраны, чтобы подписи не разъехались. */
export function certificateStatus(
  row: CertificateRow,
  nowMs: number = Date.now(),
): "used" | "expired" | "active" {
  if (row.used_at) return "used";
  return Date.parse(row.expires_at) <= nowMs ? "expired" : "active";
}
