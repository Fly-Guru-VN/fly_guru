#!/usr/bin/env node
// ============================================================================
// Проверка почтового ящика, через который Supabase будет слать письма
// (восстановление пароля, приглашения). Библиотек не требует — говорит с
// сервером по SMTP напрямую.
//
// Использование (из корня проекта):
//   node scripts/check-smtp.mjs \
//     --host smtp.timeweb.ru --port 465 \
//     --user noreply@flyguru.pro --pass 'пароль ящика' \
//     --to dkriptomoney@gmail.com
//
// Пароль с восклицательным знаком — ТОЛЬКО в одинарных кавычках, иначе bash
// подставит вместо него кусок прошлой команды. Надёжнее вообще не писать его в
// командной строке, а положить в .env.local (SMTP_HOST, SMTP_PORT, SMTP_USER,
// SMTP_PASS, SMTP_FROM) — тогда достаточно:
//   node scripts/check-smtp.mjs --to dkriptomoney@gmail.com
//
// Что делает: подключается, здоровается, логинится и реально отправляет одно
// письмо на адрес из --to. Дошло — те же данные можно вписывать в Supabase.
// Порт 465 = шифрование сразу, порт 587 = обычное подключение с переходом на
// шифрование по STARTTLS; скрипт разбирается сам по номеру порта.
// ============================================================================

import { readFileSync } from "node:fs";
import net from "node:net";
import tls from "node:tls";
import { parseArgs } from "node:util";

// ── Читаем .env.local, чтобы пароль ящика не светился в истории команд ──
// (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM — любые можно
// положить туда, а не передавать флагами.)
function loadEnvLocal() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // нет файла — рассчитываем на флаги и переменные окружения
  }
}
loadEnvLocal();

const { values: flags } = parseArgs({
  options: {
    host: { type: "string" },
    port: { type: "string" },
    user: { type: "string" },
    pass: { type: "string" },
    to: { type: "string" },
    from: { type: "string" },
  },
});

// Флаг важнее переменной из .env.local
const args = {
  host: flags.host || process.env.SMTP_HOST,
  port: flags.port || process.env.SMTP_PORT || "465",
  user: flags.user || process.env.SMTP_USER,
  pass: flags.pass || process.env.SMTP_PASS,
  to: flags.to,
  from: flags.from || process.env.SMTP_FROM,
};

if (!args.host || !args.user || !args.pass || !args.to) {
  console.error(
    "Обязательно: --host, --user, --pass, --to (и по желанию --port, --from).\n" +
      "Всё, кроме --to, можно вместо флагов положить в .env.local: " +
      "SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.\n" +
      "Пример: node scripts/check-smtp.mjs --host smtp.timeweb.ru --port 465 " +
      "--user noreply@flyguru.pro --pass 'секрет' --to dkriptomoney@gmail.com",
  );
  process.exit(1);
}

const port = Number(args.port);
const from = args.from || args.user;
const implicitTls = port === 465; // 465 — шифрование с первого байта

// ── Разговор с сервером: пишем строку, ждём ответ ──
function makeConversation(socket) {
  let buffer = "";
  let waiter = null;

  socket.setEncoding("utf8");
  socket.on("data", (chunk) => {
    buffer += chunk;
    // Ответ закончен, когда последняя ЦЕЛАЯ строка выглядит как «250 текст»
    // (в многострочном ответе все строки, кроме последней, идут с дефисом:
    // «250-SIZE», «250-AUTH», …). Пока строка не дочитана до конца — ждём.
    const lines = buffer.split("\r\n");
    const complete = lines.length >= 2 && lines[lines.length - 1] === "";
    const done = complete && /^\d{3} /.test(lines[lines.length - 2]);
    if (done && waiter) {
      const answer = buffer;
      buffer = "";
      const resolve = waiter;
      waiter = null;
      resolve(answer);
    }
  });

  return {
    read: () =>
      new Promise((resolve) => {
        waiter = resolve;
      }),
    write: (line) => socket.write(line + "\r\n"),
  };
}

// Отправляет команду и проверяет, что сервер ответил ожидаемым кодом
async function say(chat, command, expect, hint) {
  if (command !== null) chat.write(command);
  const answer = (await chat.read()).trim();
  const code = Number(answer.slice(0, 3));
  if (!expect.includes(code)) {
    console.error(`\n✖ Сервер ответил: ${answer}`);
    if (hint) console.error(`  ${hint}`);
    process.exit(1);
  }
  return answer;
}

const b64 = (s) => Buffer.from(s, "utf8").toString("base64");

function connect() {
  return new Promise((resolve, reject) => {
    const socket = implicitTls
      ? tls.connect({ host: args.host, port, servername: args.host })
      : net.connect({ host: args.host, port });
    socket.setTimeout(15000);
    socket.once(implicitTls ? "secureConnect" : "connect", () => resolve(socket));
    socket.once("timeout", () => reject(new Error("сервер не ответил за 15 секунд")));
    socket.once("error", reject);
  });
}

// ── Поехали ──
console.log(`Подключаюсь к ${args.host}:${port}${implicitTls ? " (сразу по шифрованному каналу)" : ""}…`);

let socket;
try {
  socket = await connect();
} catch (err) {
  console.error(`✖ Не подключиться: ${err.message}`);
  console.error("  Проверь адрес сервера и порт (у Timeweb — smtp.timeweb.ru, 465).");
  process.exit(1);
}

let chat = makeConversation(socket);
await say(chat, null, [220], "Ожидалось приветствие сервера.");
console.log("✓ Сервер поздоровался");

await say(chat, `EHLO flyguru.pro`, [250]);

// На 587 сначала просим перейти на шифрование
if (!implicitTls) {
  await say(chat, "STARTTLS", [220], "Сервер не умеет STARTTLS — попробуй порт 465.");
  socket = tls.connect({ socket, host: args.host, servername: args.host });
  await new Promise((resolve, reject) => {
    socket.once("secureConnect", resolve);
    socket.once("error", reject);
  });
  socket.setTimeout(15000);
  chat = makeConversation(socket);
  await say(chat, "EHLO flyguru.pro", [250]);
  console.log("✓ Перешли на шифрованный канал");
}

await say(chat, "AUTH LOGIN", [334]);
await say(chat, b64(args.user), [334]);
await say(
  chat,
  b64(args.pass),
  [235],
  "Логин или пароль не подошли. Логин — ПОЛНЫЙ адрес ящика, пароль — от самого ящика,\n" +
    "  а не от панели хостинга.",
);
console.log("✓ Логин и пароль приняты");

await say(chat, `MAIL FROM:<${from}>`, [250], `Сервер не разрешил слать от имени ${from}.`);
await say(chat, `RCPT TO:<${args.to}>`, [250, 251]);
await say(chat, "DATA", [354]);

const letter = [
  `From: FlyGuru <${from}>`,
  `To: <${args.to}>`,
  "Subject: =?UTF-8?B?" + b64("FlyGuru: проверка почтальона") + "?=",
  "MIME-Version: 1.0",
  'Content-Type: text/plain; charset="utf-8"',
  "",
  "Это тестовое письмо от FlyGuru.",
  "Если оно дошло — те же данные можно вписывать в Supabase как SMTP.",
  ".",
].join("\r\n");

socket.write(letter + "\r\n");
await say(chat, null, [250], "Письмо сервер не принял.");
console.log(`✓ Письмо ушло на ${args.to}`);

chat.write("QUIT");
socket.end();

console.log(
  "\nГотово. Проверь ящик (загляни и в «Спам»).\n" +
    "Дошло — вписываем эти же данные в Supabase → Authentication → Emails → SMTP.",
);
