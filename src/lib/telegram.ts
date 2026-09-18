import {
  DEFAULT_LOCALE,
  isAppLocale,
  LOCALE_NAMES,
  LOCALE_NAMES_RU,
} from "@/i18n/locales";
import { SITE_URL } from "@/lib/site";

// Уведомление о новой заявке в Telegram.
//
// Простыми словами: у Telegram есть «робот» (бот), которому можно через интернет
// послать команду «отправь сообщение в такой-то чат». Мы создаём бота через
// @BotFather, кладём его секретный токен и id чата в переменные окружения, и при
// каждой новой заявке шлём тебе короткое сообщение.
//
// Если токен/чат не настроены — функция молча ничего не делает. Заявка при этом
// всё равно сохраняется в базу. Уведомление — дополнение, не обязательное звено.

// Боевой адрес школы берём из lib/site: в ссылке «Принять» когда-то жил ещё
// старый vercel-адрес, и инструкторы каждый раз уходили не туда (пачка №6, п.4).

// Свои обложки для служебных сообщений (scripts/make-tg-covers.mjs).
//
// Раньше у всех трёх сообщений в чате была одна картинка — начальник на фойле.
// Причина: ссылки ведут в кабинеты (/admin, /instructor), а они за логином.
// Телеграм идёт за превью, получает редирект на /login и берёт общие OG-теги
// сайта. Починить это тегами нельзя — страницу за логином боту не отдать.
// Поэтому сообщение уходит КАРТИНКОЙ с подписью: что послали, то и видно.
const COVER = {
  booking: `${SITE_URL}/tg/booking.jpg`,
  shiftOpen: `${SITE_URL}/tg/shift-open.jpg`,
  shiftClose: `${SITE_URL}/tg/shift-close.jpg`,
} as const;

// Предел подписи под фото у Telegram. У текстового сообщения он 4096, поэтому
// длинная заявка (гость написал комментарий на страницу) уходит без картинки:
// текст заявки важнее обложки, резать его нельзя.
const CAPTION_LIMIT = 1024;

interface BookingNotification {
  serviceName: string | null; // название услуги
  clientName: string;
  contact: string; // телефон/мессенджер как ввёл гость
  messenger?: string | null; // WhatsApp/Telegram/Zalo
  preferredDate?: string | null;
  // Готовая строка «кто привёл» (см. lib/refOwner). Сырой код не шлём: он
  // ничего не говорит тому, кто читает заявку в чате (пачка №5, п.5).
  refLine?: string | null;
  src?: string | null; // источник (instagram, qr…)
  comment?: string | null;
  locale?: string | null; // язык сайта, на котором гость записался (0060)
}

export async function sendBookingNotification(
  b: BookingNotification,
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  // Не настроено — тихо выходим. Это нормальный режим до подключения бота.
  if (!token || !chatId) return;

  // Собираем текст сообщения построчно. Пустые (необязательные) поля пропускаем.
  // Шлём простым текстом (без Markdown) — так надёжнее: не нужно экранировать
  // спецсимволы, любые данные клиента отправятся без риска ошибки форматирования.
  const lines: string[] = ["🔔 Новая заявка FlyGuru", ""];
  if (b.serviceName) lines.push(`📋 Услуга: ${b.serviceName}`);
  lines.push(`👤 Имя: ${b.clientName}`);
  const contactLine = b.messenger
    ? `${b.contact} (${b.messenger})`
    : b.contact;
  lines.push(`📞 Контакт: ${contactLine}`);
  if (b.preferredDate) lines.push(`📅 Дата: ${b.preferredDate}`);
  if (b.comment) lines.push(`💬 Комментарий: ${b.comment}`);
  if (b.refLine) lines.push(`🎟️ ${b.refLine}`);
  if (b.src) lines.push(`🧭 Источник: ${b.src}`);
  // Язык гостя показываем, только если он НЕ русский: у русскоязычной заявки
  // эта строка ничего не добавляет, а в чате их большинство. Пишем и по-русски
  // (для админа), и на самом языке — чтобы было видно, что увидит клиент.
  if (b.locale && b.locale !== DEFAULT_LOCALE && isAppLocale(b.locale)) {
    lines.push(
      `🌐 Язык клиента: ${LOCALE_NAMES_RU[b.locale]} (${LOCALE_NAMES[b.locale]})`,
    );
  }
  // Ссылка на ленту заявок — как «Принять» у инструкторов: из чата сразу
  // попадаешь туда, где заявку обрабатывают, а не ищешь адрес по закладкам.
  lines.push("", `Открыть: ${SITE_URL}/admin/bookings`);

  await sendTelegram(chatId, lines.join("\n"), COVER.booking);
}

// Уведомление в группу ИНСТРУКТОРОВ: админ подтвердил заявку → появилась
// запись, которую можно принять на сайте. Телефон клиента намеренно не шлём
// в общий чат — его увидит тот, кто примет запись в кабинете.
export async function sendInstructorsBookingAlert(b: {
  bookingNo: number | null;
  serviceName: string | null;
  scheduledTime: string | null;
  preferredDate: string | null;
}): Promise<void> {
  const chatId = process.env.TELEGRAM_INSTRUCTORS_CHAT_ID;
  if (!chatId) return; // группа ещё не подключена — тихо выходим

  const lines = [
    `🟢 Новая запись${b.bookingNo ? ` #${b.bookingNo}` : ""}`,
    "",
  ];
  if (b.serviceName) lines.push(`📋 ${b.serviceName}`);
  if (b.preferredDate) lines.push(`📅 ${b.preferredDate}`);
  if (b.scheduledTime) lines.push(`🕐 ${b.scheduledTime}`);
  lines.push("", `Принять: ${SITE_URL}/instructor/bookings`);

  await sendTelegram(chatId, lines.join("\n"), COVER.booking);
}

// Напоминалка про смену в группу инструкторов (пак C). Конкретного человека не
// тегаем — просто шлём ссылку на экран смены; кто на выходе, тот и откроет/
// закроет. Крон дёргает это утром (open) и вечером (close).
const SHIFT_URL = `${SITE_URL}/instructor/shift`;

export async function sendShiftReminder(kind: "open" | "close"): Promise<boolean> {
  const chatId = process.env.TELEGRAM_INSTRUCTORS_CHAT_ID;
  if (!chatId) {
    // Молчаливый выход тут — главный подозреваемый в «напоминалка не пришла»,
    // поэтому оставляем след в логах крона, а не гадаем потом.
    console.error("[telegram] TELEGRAM_INSTRUCTORS_CHAT_ID не задан — напоминалка не отправлена");
    return false;
  }

  const text =
    kind === "open"
      ? [
          "🌅 Открытие смены",
          "",
          "Кто сегодня на воде — сделайте фото на пляже, оно откроет смену. Доску и крыло снимает тот, кому удобно.",
          "",
          SHIFT_URL,
        ].join("\n")
      : [
          "🌇 Закрытие смены",
          "",
          "Уходите — сделайте фото у бара на выходе, оно закроет смену. Оборудование снимать не надо.",
          "",
          SHIFT_URL,
        ].join("\n");

  return sendTelegram(chatId, text, kind === "open" ? COVER.shiftOpen : COVER.shiftClose);
}

// Свободное сообщение в рабочий чат админа. Нужно там, где текст не подходит
// ни под «новая заявка», ни под напоминание о смене: например, клиент сам
// отменил свою запись в кабинете — это надо увидеть до того, как инструктор
// поедет на воду.
export async function sendStaffMessage(text: string): Promise<void> {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) return;
  await sendTelegram(chatId, text);
}

// Запрос из магазина (форма «Перезвоните мне» на /shop). В отличие от заявок на
// полёт, в базу он НЕ пишется (этап 1 магазина), поэтому сообщение в чат — это
// единственный след заявки. Отсюда true/false: при сбое гость должен увидеть
// «не получилось» и написать в мессенджер сам, а не думать, что его услышали.
export async function sendShopInquiry(text: string): Promise<boolean> {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) {
    console.error("[telegram] TELEGRAM_CHAT_ID не задан — запрос из магазина не отправлен");
    return false;
  }
  return sendTelegram(chatId, `${text}\n\nСайт: ${SITE_URL}/shop`);
}

// Общая отправка простым текстом (без Markdown — надёжнее, ничего не надо
// экранировать). Операцию не роняем из-за уведомления, но и не глотаем сбой
// молча — пишем в лог, иначе «уведомление не пришло» невозможно расследовать.
//
// Задан photo — уходит картинка с подписью (sendPhoto), иначе обычный текст.
// Картинку Telegram забирает с сайта сам по ссылке; файлы лежат в public/tg.
//
// Две попытки: ПЕРВЫЙ исходящий запрос из «холодной» serverless-функции (свежий
// инстанс — DNS + TLS-хендшейк) бывает заметно медленнее и не укладывался в
// прежний таймаут 4с — терялось именно первое уведомление, а «тёплые» доходили.
// Больший таймаут + ретрай это закрывают.
async function sendTelegram(
  chatId: string,
  text: string,
  photo?: string,
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("[telegram] TELEGRAM_BOT_TOKEN не задан — сообщение не отправлено");
    return false;
  }

  const withPhoto = Boolean(photo) && text.length <= CAPTION_LIMIT;
  const url = `https://api.telegram.org/bot${token}/${withPhoto ? "sendPhoto" : "sendMessage"}`;
  const body = JSON.stringify(
    withPhoto
      ? { chat_id: chatId, photo, caption: text }
      : {
          chat_id: chatId,
          text,
          // Своя обложка не влезла — тогда и чужого превью не надо: телеграм
          // подставил бы сюда общую картинку сайта, ровно ту, от которой
          // уходим. Там, где картинки нет вовсе (магазин, отмена записи),
          // превью остаётся как было.
          ...(photo ? { link_preview_options: { is_disabled: true } } : {}),
        },
  );

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) return true;

      // Telegram ответил ошибкой. 4xx — наш запрос кривой (неверный chat_id и
      // т.п.), ретрай не поможет: логируем и выходим. 5xx/сеть — пробуем ещё.
      const detail = await res.text().catch(() => "");
      console.error(
        `[telegram] send failed (attempt ${attempt}): ${res.status} ${detail}`,
      );
      if (res.status >= 400 && res.status < 500) return false;
    } catch (e) {
      // Таймаут/сеть — не роняем операцию, но фиксируем в логе и ретраим.
      console.error(
        `[telegram] send error (attempt ${attempt}):`,
        e instanceof Error ? e.message : e,
      );
    }
  }
  return false;
}
