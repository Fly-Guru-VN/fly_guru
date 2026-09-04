import assert from "node:assert/strict";
import test from "node:test";
import { sendShiftReminder } from "./telegram";

test("напоминание возвращает true только после успешного ответа Telegram", async () => {
  const oldToken = process.env.TELEGRAM_BOT_TOKEN;
  const oldChat = process.env.TELEGRAM_INSTRUCTORS_CHAT_ID;
  const oldFetch = globalThis.fetch;
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  process.env.TELEGRAM_INSTRUCTORS_CHAT_ID = "test-chat";

  let requestBody = "";
  globalThis.fetch = async (_input, init) => {
    requestBody = String(init?.body ?? "");
    return new Response("", { status: 200 });
  };

  try {
    assert.equal(await sendShiftReminder("open"), true);
    assert.match(requestBody, /Открытие смены/);
    assert.match(requestBody, /test-chat/);
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
