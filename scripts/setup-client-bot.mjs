#!/usr/bin/env node
// ============================================================================
// Настройка клиентского Telegram-бота FlyGuru (кабинет гостя).
//
// Что делает скрипт, по-человечески: говорит Telegram, куда присылать
// сообщения от клиентов (webhook), и вешает боту кнопку «Кабинет», которая
// открывает наш сайт прямо внутри Telegram (мини-приложение).
//
// Запускается ОДИН раз после заведения бота у @BotFather и потом только при
// смене адреса сайта.
//
// Использование (из корня проекта):
//   node scripts/setup-client-bot.mjs                       # боевой адрес
//   node scripts/setup-client-bot.mjs --url https://xxx.ngrok.io   # для проверки
//   node scripts/setup-client-bot.mjs --show                 # показать текущие настройки
//
// Ключи берутся из .env.local:
//   TELEGRAM_CLIENT_BOT_TOKEN  — токен бота от @BotFather (обязательно)
//   TELEGRAM_CLIENT_BOT_SECRET — обязательный секрет webhook: без него скрипт
//                                откажется публиковать небезопасный адрес
// ============================================================================

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

const SITE_URL = "https://www.flyguru.pro";

function loadEnvLocal() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // .env.local может не быть — тогда переменные придут из окружения.
  }
}
loadEnvLocal();

const { values } = parseArgs({
  options: {
    url: { type: "string" },
    show: { type: "boolean", default: false },
  },
});

const token = process.env.TELEGRAM_CLIENT_BOT_TOKEN;
if (!token) {
  console.error("Нет TELEGRAM_CLIENT_BOT_TOKEN в .env.local — заведите бота у @BotFather.");
  process.exit(1);
}

const base = `https://api.telegram.org/bot${token}`;

async function call(method, payload) {
  const res = await fetch(`${base}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`${method}: ${json.description}`);
  return json.result;
}

const site = (values.url ?? SITE_URL).replace(/\/$/, "");

if (values.show) {
  console.log("Бот:     ", (await call("getMe")).username);
  console.log("Webhook: ", JSON.stringify(await call("getWebhookInfo"), null, 2));
  process.exit(0);
}

const secret = process.env.TELEGRAM_CLIENT_BOT_SECRET;
if (!secret) {
  console.error(
    "TELEGRAM_CLIENT_BOT_SECRET не задан — webhook не будет установлен.\n" +
      "Придумайте длинную случайную строку, положите её в .env.local и в\n" +
      "Environment Variables Vercel, затем запустите скрипт снова.",
  );
  process.exit(1);
}

const me = await call("getMe");

// 1. Куда Telegram шлёт сообщения клиентов.
await call("setWebhook", {
  url: `${site}/api/tg`,
  allowed_updates: ["message"],
  ...(secret ? { secret_token: secret } : {}),
});

// 2. Кнопка меню слева от поля ввода — открывает кабинет.
await call("setChatMenuButton", {
  menu_button: {
    type: "web_app",
    text: "Кабинет",
    web_app: { url: `${site}/member` },
  },
});

// 3. Подсказка команд.
await call("setMyCommands", {
  commands: [{ command: "start", description: "Открыть кабинет" }],
});

console.log(`✅ Бот @${me.username} настроен.`);
console.log(`   Сообщения идут на ${site}/api/tg`);
console.log(`   Кабинет открывается по ${site}/member`);
console.log(secret ? "   Секрет webhook: задан." : "   Секрет webhook: НЕ задан (см. предупреждение выше).");
