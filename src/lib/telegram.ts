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
  // Ссылка на ленту заявок — как «Принять» у инструкторов: из чата сразу
  // попадаешь туда, где заявку обрабатывают, а не ищешь адрес по закладкам.
  lines.push("", `Открыть: ${SITE_URL}/admin/bookings`);

  await sendTelegram(chatId, lines.join("\n"));
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

  await sendTelegram(chatId, lines.join("\n"));
}

// Напоминалка про смену в группу инструкторов (пак C). Конкретного человека не
// тегаем — просто шлём ссылку на экран смены; кто на выходе, тот и откроет/
// закроет. Крон дёргает это утром (open) и вечером (close).
const SHIFT_URL = `${SITE_URL}/instructor/shift`;

export async function sendShiftReminder(kind: "open" | "close"): Promise<void> {
  const chatId = process.env.TELEGRAM_INSTRUCTORS_CHAT_ID;
  if (!chatId) {
    // Молчаливый выход тут — главный подозреваемый в «напоминалка не пришла»,
    // поэтому оставляем след в логах крона, а не гадаем потом.
    console.error("[telegram] TELEGRAM_INSTRUCTORS_CHAT_ID не задан — напоминалка не отправлена");
    return;
  }

  const text =
    kind === "open"
      ? [
          "🌅 Открытие смены",
          "",
          "Кто сегодня на воде — откройте смену и сфотографируйте доску и крыло.",
          "",
          SHIFT_URL,
        ].join("\n")
      : [
          "🌇 Закрытие смены",
          "",
          "Не забудьте закрыть смену и снова снять инвентарь — по вечерним фото видно, что изменилось за день.",
          "",
          SHIFT_URL,
        ].join("\n");

  await sendTelegram(chatId, text);
}

// Общая отправка простым текстом (без Markdown — надёжнее, ничего не надо
// экранировать). Операцию не роняем из-за уведомления, но и не глотаем сбой
// молча — пишем в лог, иначе «уведомление не пришло» невозможно расследовать.
//
// Две попытки: ПЕРВЫЙ исходящий запрос из «холодной» serverless-функции (свежий
// инстанс — DNS + TLS-хендшейк) бывает заметно медленнее и не укладывался в
// прежний таймаут 4с — терялось именно первое уведомление, а «тёплые» доходили.
// Больший таймаут + ретрай это закрывают.
async function sendTelegram(chatId: string, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const body = JSON.stringify({ chat_id: chatId, text });

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) return;

      // Telegram ответил ошибкой. 4xx — наш запрос кривой (неверный chat_id и
      // т.п.), ретрай не поможет: логируем и выходим. 5xx/сеть — пробуем ещё.
      const detail = await res.text().catch(() => "");
      console.error(
        `[telegram] send failed (attempt ${attempt}): ${res.status} ${detail}`,
      );
      if (res.status >= 400 && res.status < 500) return;
    } catch (e) {
      // Таймаут/сеть — не роняем операцию, но фиксируем в логе и ретраим.
      console.error(
        `[telegram] send error (attempt ${attempt}):`,
        e instanceof Error ? e.message : e,
      );
    }
  }
}
