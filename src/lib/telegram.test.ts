import assert from "node:assert/strict";
import test from "node:test";
import { sendBookingNotification, sendShiftReminder } from "./telegram";

test("напоминание возвращает true только после успешного ответа Telegram", async () => {
  const oldToken = process.env.TELEGRAM_BOT_TOKEN;
  const oldChat = process.env.TELEGRAM_INSTRUCTORS_CHAT_ID;
  const oldFetch = globalThis.fetch;
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  process.env.TELEGRAM_INSTRUCTORS_CHAT_ID = "test-chat";

  let requestUrl = "";
  let requestBody = "";
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    requestBody = String(init?.body ?? "");
    return new Response("", { status: 200 });
  };

  try {
    assert.equal(await sendShiftReminder("open"), true);
    assert.match(requestBody, /Открытие смены/);
    assert.match(requestBody, /test-chat/);
    // Напоминалка уходит своей картинкой, а не текстом с превью сайта.
    assert.match(requestUrl, /sendPhoto$/);
    assert.match(requestBody, /tg\/shift-open\.jpg/);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = oldToken;
    if (oldChat === undefined) delete process.env.TELEGRAM_INSTRUCTORS_CHAT_ID;
    else process.env.TELEGRAM_INSTRUCTORS_CHAT_ID = oldChat;
  }
});

test("ошибка Telegram не выдаётся за успешную отправку", async () => {
  const oldToken = process.env.TELEGRAM_BOT_TOKEN;
  const oldChat = process.env.TELEGRAM_INSTRUCTORS_CHAT_ID;
  const oldFetch = globalThis.fetch;
  const oldConsoleError = console.error;
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  process.env.TELEGRAM_INSTRUCTORS_CHAT_ID = "test-chat";
  globalThis.fetch = async () => new Response("bad chat", { status: 400 });
  console.error = () => undefined;

  try {
    assert.equal(await sendShiftReminder("close"), false);
  } finally {
    globalThis.fetch = oldFetch;
    console.error = oldConsoleError;
    if (oldToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = oldToken;
    if (oldChat === undefined) delete process.env.TELEGRAM_INSTRUCTORS_CHAT_ID;
    else process.env.TELEGRAM_INSTRUCTORS_CHAT_ID = oldChat;
  }
});

test("длинная заявка уходит текстом, но без чужого превью", async () => {
  const oldToken = process.env.TELEGRAM_BOT_TOKEN;
  const oldChat = process.env.TELEGRAM_CHAT_ID;
  const oldFetch = globalThis.fetch;
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  process.env.TELEGRAM_CHAT_ID = "test-chat";

  let requestUrl = "";
  let requestBody = "";
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    requestBody = String(init?.body ?? "");
    return new Response("", { status: 200 });
  };

  try {
    // Подпись под фото у Telegram — до 1024 символов. Гость с длинным
    // комментарием в этот предел не влезает, а резать текст заявки нельзя:
    // тогда сообщение уходит текстом и без картинки вовсе.
    await sendBookingNotification({
      serviceName: null,
      clientName: "Гость",
      contact: "0900000000",
      comment: "я".repeat(1100),
    });
    assert.match(requestUrl, /sendMessage$/);
    assert.match(requestBody, /"is_disabled":true/);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = oldToken;
    if (oldChat === undefined) delete process.env.TELEGRAM_CHAT_ID;
    else process.env.TELEGRAM_CHAT_ID = oldChat;
  }
});
