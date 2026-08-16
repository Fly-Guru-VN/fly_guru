// Работа с телефонами. Люди вводят номера по-разному: «+84 90 123 45 67»,
// «090-123-4567», «84901234567». Чтобы искать клиента по телефону, приводим
// всё к цифрам и сравниваем по хвосту.

// Только цифры: "+84 90 123-45-67" → "84901234567".
export function phoneDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

// Похоже ли это на телефон (пачка правок №4, пак B, пункт 8).
//
// Раньше в поле «Телефон» принималось что угодно: уходили заявки с «позвонить
// маме», с половиной номера, с именем вместо цифр. Дозвониться потом нельзя,
// а понять это можно только через сутки.
//
// Границы намеренно широкие: у школы и вьетнамские номера (0901234567 — 10
// цифр, без нуля 9), и туристы со всего мира. E.164 разрешает максимум 15
// цифр, снизу берём 8 — короче настоящих мобильных не бывает. Задача проверки
// не «угадать страну», а отсечь явный мусор.
const PHONE_MIN_DIGITS = 8;
const PHONE_MAX_DIGITS = 15;

export function isValidPhone(raw: string | null | undefined): boolean {
  const n = phoneDigits(raw ?? "").length;
  return n >= PHONE_MIN_DIGITS && n <= PHONE_MAX_DIGITS;
}

// Единый текст ошибки — чтобы во всех формах он звучал одинаково.
export const PHONE_ERROR =
  "Телефон — только цифры, от 8 до 15 (например 0901234567).";

// Ник в телеге: нормализуем к виду без «@» и без ссылки. Люди вставляют
// «@nick», «t.me/nick» и «https://t.me/nick» вперемешку — храним одно,
// показываем со «@».
export function normalizeTelegram(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const nick = s
    .replace(/^https?:\/\//i, "")
    .replace(/^t\.me\//i, "")
    .replace(/^@/, "")
    .trim();
  // Правила Telegram: 5–32 символа, буквы/цифры/подчёркивание.
  return /^[a-zA-Z0-9_]{5,32}$/.test(nick) ? nick : null;
}

// Совпадают ли два номера. Сравниваем последние 9 цифр — этого достаточно,
// чтобы «+84 901 234 567» и «0901234567» считались одним номером, и при этом
// не путать разных людей.
export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const da = phoneDigits(a ?? "");
  const db = phoneDigits(b ?? "");
  if (da.length < 7 || db.length < 7) return da === db && da !== "";
  return da.slice(-9) === db.slice(-9);
}
