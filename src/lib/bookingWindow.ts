import { VN_OFFSET_MS } from "@/lib/dates";

// Окна брони и отмены — правила начальника от 30.08.2026.
//
//   Записаться  — не позднее 20:00 дня, ПРЕДЫДУЩЕГО дню катания,
//                 и само окно приёма заявок открыто с 8:00 до 20:00.
//   Отменить    — не позднее чем за час до начала.
//
// Функции чистые (только считают, никуда не ходят) и живут отдельным файлом
// намеренно: их зовёт и сервер (он решает, принимать ли), и кабинет в браузере
// (он гасит кнопку заранее, чтобы человек не тыкал в отказ). Правило должно
// быть ОДНО: разъедется — сервер будет отказывать в том, что кабинет разрешал.
//
// Всё время считаем по Нячангу: сервер на Vercel живёт в UTC, и «20:00»
// без явного часового пояса означало бы 03:00 вьетнамского утра.

export const BOOKING_OPEN_HOUR = 8; // раньше 8 утра заявки не принимаем
export const BOOKING_DEADLINE_HOUR = 20; // 20:00 предыдущего дня
export const CANCEL_WINDOW_MIN = 60; // за час до начала

// Момент вьетнамских «стенных часов» в обычном времени (epoch ms).
// day — 'YYYY-MM-DD', hhmm — 'HH:MM'.
export function vnMomentMs(day: string, hhmm: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const utc = Date.parse(`${day}T${hhmm}:00.000Z`);
  if (Number.isNaN(utc)) return null;
  // Полдень в Нячанге наступает на 7 часов РАНЬШЕ, чем полдень по UTC.
  return utc - VN_OFFSET_MS;
}

// Крайний срок, до которого принимаем бронь на день day.
export function bookingDeadlineMs(day: string): number | null {
  const dayStart = vnMomentMs(day, "00:00");
  if (dayStart === null) return null;
  // Минус сутки, плюс 20 часов = 20:00 предыдущего дня.
  return dayStart - 24 * 3600 * 1000 + BOOKING_DEADLINE_HOUR * 3600 * 1000;
}

// Открыт ли приём заявок ПРЯМО СЕЙЧАС. Ответ начальника (30.08.2026):
// «промежуток записи с 8 утра до 8 вечера, после 8 — только через поддержку».
// Это отдельное правило от дедлайна: дедлайн говорит, НА КАКОЙ день можно
// записаться, а это — в КАКИЕ часы кабинет вообще принимает заявку. Ночью
// человек не запишется даже на следующую неделю: живой админ всё равно спит,
// а бронь у нас подтверждает он.
export function isBookingOpenNow(nowMs: number = Date.now()): boolean {
  const vnHour = new Date(nowMs + VN_OFFSET_MS).getUTCHours();
  return vnHour >= BOOKING_OPEN_HOUR && vnHour < BOOKING_DEADLINE_HOUR;
}

export function canBookOn(day: string, nowMs: number = Date.now()): boolean {
  const deadline = bookingDeadlineMs(day);
  return deadline !== null && nowMs <= deadline;
}

// Первый день, на который ещё можно записаться прямо сейчас. Нужен формам:
// подставить в поле даты и запретить выбирать раньше.
export function firstBookableDay(nowMs: number = Date.now()): string {
  // Идём от завтрашнего дня по вьетнамскому календарю и берём первый, чей
  // дедлайн ещё не прошёл. Дальше двух шагов цикл не уходит: если до 20:00
  // сегодня — это завтра, если после — послезавтра.
  const vnDay = new Date(nowMs + VN_OFFSET_MS);
  for (let i = 1; i <= 3; i++) {
    const d = new Date(vnDay.getTime() + i * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    if (canBookOn(d, nowMs)) return d;
  }
  return new Date(vnDay.getTime() + 2 * 24 * 3600 * 1000).toISOString().slice(0, 10);
}

// Время из заявки: у нас scheduled_time — свободный текст (его исторически
// вписывал админ руками). Кабинет пишет туда ровное 'HH:MM', но в старых
// записях бывает что угодно — «утром», «15-00». Вытаскиваем часы и минуты,
// если они там есть; не разобрали — вернём null, и решение примет вызывающий.
export function parseTimeText(raw: string | null | undefined): string | null {
  const m = String(raw ?? "").match(/(\d{1,2})[:.\-\s](\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

// Можно ли ещё отменить запись на day в hhmm.
//
// Времени в записи нет (её заводил админ и написал «созвонимся») — считаем
// началом полночь этого дня: отменить можно до конца предыдущих суток. Это
// строже, чем «за час», и это сознательно: угадывать за клиента, во сколько
// он собирался, мы не имеем права — он попросит отмену у поддержки.
export function canCancelBooking(
  day: string | null,
  timeText: string | null,
  nowMs: number = Date.now(),
): boolean {
  if (!day) return false;
  const start = vnMomentMs(day, parseTimeText(timeText) ?? "00:00");
  if (start === null) return false;
  return nowMs <= start - CANCEL_WINDOW_MIN * 60 * 1000;
}
