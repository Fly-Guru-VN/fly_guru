import { SITE_URL, SUPPORT_URL } from "@/lib/site";

// Клиентский бот — третий, отдельный от служебных.
//
// TELEGRAM_BOT_TOKEN         — уведомлялка в рабочий чат («новая заявка»).
// TELEGRAM_REPORT_BOT_TOKEN  — отчёты начальнику.
// TELEGRAM_CLIENT_BOT_TOKEN  — вот этот: с ним разговаривают КЛИЕНТЫ.
//
// Разделение не косметическое: клиентский бот пишут посторонние люди, и он не
// должен иметь отношения к чатам, где лежат деньги и заявки.

export const MEMBER_APP_URL = `${SITE_URL}/member`;

export { SUPPORT_URL };

export function clientBotToken(): string | null {
  return process.env.TELEGRAM_CLIENT_BOT_TOKEN || null;
}

// Кнопка «Поделиться номером» — штатная кнопка Telegram: человек ничего не
// печатает, номер приходит нам одним нажатием. Это и есть вся «регистрация».
export const SHARE_PHONE_KEYBOARD = {
  keyboard: [[{ text: "📱 Поделиться номером", request_contact: true }]],
  resize_keyboard: true,
  one_time_keyboard: true,
};

// Кнопка, открывающая кабинет прямо внутри Telegram (web_app), — то самое
// «мини-приложение». Открывается наш обычный адрес /member.
//
// Кнопка постоянная (reply-клавиатура, а не inline): она остаётся внизу экрана
// навсегда и заодно вытесняет клавиатуру «Поделиться номером». Иначе человеку
// пришлось бы листать переписку вверх в поисках нужного сообщения.
export const CABINET_KEYBOARD = {
  keyboard: [[{ text: "🪁 Кабинет", web_app: { url: MEMBER_APP_URL } }]],
  resize_keyboard: true,
  is_persistent: true,
};

type ReplyMarkup = Record<string, unknown>;

// Обращение к Telegram от имени клиентского бота. Как и в lib/telegram, сбой не
// роняет операцию: человек уже поделился номером и связь уже записана — если не
// доставилось сообщение, он просто нажмёт кнопку ещё раз.
export async function callClientBot(
  method: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  const token = clientBotToken();
  if (!token) return false;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return true;
    const detail = await res.text().catch(() => "");
    console.error(`[tg-client] ${method} failed: ${res.status} ${detail}`);
  } catch (e) {
    console.error(`[tg-client] ${method} error:`, e instanceof Error ? e.message : e);
  }
  return false;
}

export async function sendClientMessage(
  chatId: number | string,
  text: string,
  replyMarkup?: ReplyMarkup,
): Promise<void> {
  // Простым текстом, без Markdown — не надо экранировать имена и номера.
  await callClientBot("sendMessage", {
    chat_id: chatId,
    text,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}
