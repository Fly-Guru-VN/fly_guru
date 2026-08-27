#!/usr/bin/env node
// ============================================================================
// Отчёт начальнику в телеграм-группу.
//
// Зачем: после каждого рабочего сеанса начальнику нужен короткий человеческий
// текст — что сделано и зачем. Раньше это была вкладка «Обновления» на сайте,
// но её мало: там только кабинеты, а правки по страницам сайта туда не
// попадают, и заходить смотреть надо самому.
//
// Использование (из корня проекта):
//
//   node scripts/report-to-telegram.mjs                 показать, что уйдёт
//   node scripts/report-to-telegram.mjs --send          отправить
//
// Без --send скрипт НИЧЕГО не отправляет: печатает готовое сообщение в
// терминал, чтобы его можно было прочитать глазами. Это главное правило —
// начальнику не должно улететь то, что человек не видел.
//
// Откуда берётся текст (первое подходящее):
//   --text "..."         прямо в команде
//   --file путь          свой файл
//   ничего               prompts/report-draft.md — файл-черновик по умолчанию
//   --from-updates       собрать из ленты «Обновления» (src/content/updates.ts)
//
// Полезное:
//   --days 7             для --from-updates: за сколько последних дней брать
//   --since 2026-08-23   для --from-updates: с какой даты (вместо --days)
//   --title "Заголовок"  своя первая строка вместо «Отчёт по работе»
//
// Ключи берутся из .env.local:
//   TELEGRAM_REPORT_BOT_TOKEN — токен бота-отчётника от @BotFather;
//   TELEGRAM_REPORT_CHAT_ID   — id группы с начальником.
// Это ОТДЕЛЬНЫЙ бот от того, что шлёт заявки (TELEGRAM_BOT_TOKEN): у них
// разные группы и разные читатели, и путать их нельзя.
// ============================================================================

import { readFileSync, existsSync } from "node:fs";
import { parseArgs } from "node:util";

const DRAFT_PATH = "prompts/report-draft.md";
const TELEGRAM_LIMIT = 4096; // жёсткий предел длины одного сообщения

function loadEnvLocal() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // нет файла — рассчитываем на переменные окружения
  }
}

// ── текст из ленты «Обновления» ────────────────────────────────────────────
// Файл updates.ts — это TypeScript, и разбирать его импортом из .mjs нельзя.
// Читаем как текст и вынимаем поля записей: структура файла наша, меняется
// редко, а тащить ради этого сборщик — дороже задачи.
function readUpdates() {
  const src = readFileSync("src/content/updates.ts", "utf8");
  const body = src.slice(src.indexOf("export const UPDATES"));
  const entries = [];
  // Каждая запись — блок вида { date: "...", kind: "...", ..., text: "..." },
  // строки в двойных кавычках, внутри могут быть экранированные кавычки.
  const re = /\{\s*date:\s*"([\d-]+)",([\s\S]*?)\n  \}/g;
  let m;
  while ((m = re.exec(body))) {
    const [, date, rest] = m;
    const field = (name) => {
      const f = rest.match(new RegExp(`${name}:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
      return f ? f[1].replace(/\\"/g, '"').replace(/\\n/g, "\n") : "";
    };
    entries.push({ date, kind: field("kind"), title: field("title"), text: field("text") });
  }
  return entries;
}

const KIND_ICON = { new: "🆕", fix: "🔧", gone: "🗑" };

function buildFromUpdates({ since }) {
  const picked = readUpdates().filter((u) => u.date >= since);
  if (picked.length === 0) return "";
  return picked
    .map((u) => `${KIND_ICON[u.kind] ?? "•"} <b>${esc(u.title)}</b>\n${esc(u.text)}`)
    .join("\n\n");
}

// ── разметка ───────────────────────────────────────────────────────────────
// Телеграм понимает свой куцый HTML: <b>, <i>, <code>. Всё остальное — и
// особенно голые < > & — надо экранировать, иначе он отвечает ошибкой и
// сообщение не уходит вовсе.
function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Черновик пишется в markdown — переводим в то немногое, что телеграм умеет.
function markdownToTelegram(md) {
  return md
    .split("\n")
    .map((line) => {
      const heading = line.match(/^#{1,6}\s+(.*)$/);
      if (heading) return `<b>${esc(heading[1])}</b>`;
      const bullet = line.match(/^\s*[-*]\s+(.*)$/);
      const body = bullet ? `• ${bullet[1]}` : line;
      // **жирный** → <b>жирный</b>, всё прочее экранируем как есть
      return esc(body).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Длинный отчёт режем по абзацам, а не по буквам: иначе разрыв придётся на
// середину тега <b> и телеграм отвергнет всю посылку.
function splitMessage(text) {
  if (text.length <= TELEGRAM_LIMIT) return [text];
  const parts = [];
  let current = "";
  for (const para of text.split("\n\n")) {
    if (current && current.length + para.length + 2 > TELEGRAM_LIMIT) {
      parts.push(current);
      current = "";
    }
    current = current ? `${current}\n\n${para}` : para;
  }
  if (current) parts.push(current);
  return parts;
}

// ── отправка ───────────────────────────────────────────────────────────────
async function send(token, chatId, text) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(`телеграм отказал: ${data.description ?? res.status}`);
  }
}

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

// ── main ───────────────────────────────────────────────────────────────────
loadEnvLocal();

const { values } = parseArgs({
  options: {
    send: { type: "boolean", default: false },
    text: { type: "string" },
    file: { type: "string" },
    "from-updates": { type: "boolean", default: false },
    days: { type: "string" },
    since: { type: "string" },
    title: { type: "string" },
  },
});

const today = new Date().toISOString().slice(0, 10);

let body;
if (values.text) {
  body = markdownToTelegram(values.text);
} else if (values["from-updates"]) {
  const since =
    values.since ??
    new Date(Date.now() - (Number(values.days) || 7) * 86400_000).toISOString().slice(0, 10);
  body = buildFromUpdates({ since });
  if (!body) fail(`в ленте «Обновления» нет записей с ${since}. Возьми больше дней: --days 14`);
} else {
  const path = values.file ?? DRAFT_PATH;
  if (!existsSync(path)) {
    fail(
      `нет файла ${path}.\n  Положи в него короткий отчёт (что сделано и зачем)\n` +
        `  или передай текст прямо: --text "Заменили дизайн страницы «Цены»"`
    );
  }
  body = markdownToTelegram(readFileSync(path, "utf8"));
}

if (!body.trim()) fail("отчёт пустой — отправлять нечего");

const title = values.title ?? `📋 FlyGuru — отчёт ${today}`;
const message = `<b>${esc(title)}</b>\n\n${body}`;
const chunks = splitMessage(message);

if (!values.send) {
  // В предпросмотре показываем текст так, как его увидит человек в телеграме:
  // без тегов и с обратно распакованными &lt; &amp; — иначе читать неудобно.
  const readable = message
    .replace(/<\/?b>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
  console.log("\n─── так это уйдёт в группу ─────────────────────────────────\n");
  console.log(readable);
  console.log("\n────────────────────────────────────────────────────────────");
  console.log(
    `\nЗнаков: ${message.length}${chunks.length > 1 ? `, сообщений: ${chunks.length}` : ""}` +
      `\nОтправить: та же команда с --send на конце\n`
  );
  process.exit(0);
}

const token = process.env.TELEGRAM_REPORT_BOT_TOKEN;
const chatId = process.env.TELEGRAM_REPORT_CHAT_ID;
if (!token || !chatId) {
  fail("в .env.local нет TELEGRAM_REPORT_BOT_TOKEN или TELEGRAM_REPORT_CHAT_ID");
}

try {
  for (const chunk of chunks) await send(token, chatId, chunk);
  console.log(`\n✓ отправлено в группу${chunks.length > 1 ? ` (${chunks.length} сообщения)` : ""}\n`);
} catch (e) {
  fail(e.message);
}
