import { phoneDigits } from "@/lib/phone";

// Вход сотрудника в кабинет (09.11.2026, перед передачей проекта начальнику).
//
// Раньше аккаунт заводили только скриптом scripts/create-user.mjs из
// терминала. Теперь это кнопка в «Настройках», и правила, по которым скрипт
// собирал логин, живут здесь, чтобы скрипт и админка не разошлись.
//
// Пароль в базе НЕ храним (решение David от 09.11.2026): он показывается
// один раз, в момент выдачи. Забыли — «Выдать новый пароль». Открытый пароль
// в таблице при любой утечке отдал бы все входы разом.

// Вход по телефону: у Supabase Auth обязателен email, поэтому из номера
// собираем технический адрес. Настоящего ящика за ним нет, письма туда не
// уходят (см. requestPasswordResetAction).
export const TECH_EMAIL_SUFFIX = "@phone.flyguru.local";

export function techEmailForPhone(phone: string): string {
  return `${phoneDigits(phone)}${TECH_EMAIL_SUFFIX}`;
}

export function isTechEmail(email: string | null | undefined): boolean {
  return Boolean(email?.endsWith(TECH_EMAIL_SUFFIX));
}

// Что сотрудник вводит в поле «Логин». Телефон, если он есть, иначе email.
export function loginLabel(
  phone: string | null | undefined,
  email: string | null | undefined,
): string | null {
  const digits = phoneDigits(phone ?? "");
  if (digits) return digits;
  if (email && !isTechEmail(email)) return email;
  return null;
}

// Пароль, который удобно продиктовать и набрать на телефоне: заглавная буква,
// 5 строчных и 4 цифры, без похожих символов (I/l/1, O/0), например Mkrtpa4827.
// В боевом Supabase включено правило «строчные + заглавные + цифры»
// (проверено живьём 09.11.2026), поэтому есть все три вида.
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghjkmnpqrstuvwxyz";
const DIGITS = "23456789";

export function generatePassword(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < 10; i++) {
    const set = i === 0 ? UPPER : i < 6 ? LOWER : DIGITS;
    out += set[bytes[i] % set.length];
  }
  return out;
}
