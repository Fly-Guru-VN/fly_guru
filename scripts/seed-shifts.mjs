#!/usr/bin/env node
// ============================================================================
// Занести график смен на месяц в таблицу shifts.
//
// Зачем скрипт, а не руками в календаре: месяц — это полторы сотни клеток, и
// проставлять их мышкой по одной значит гарантированно где-нибудь промахнуться.
// Денис присылает график картинкой, график переносится сюда таблицей и
// заливается одной командой.
//
// Использование (из корня проекта):
//   node scripts/seed-shifts.mjs             # показать, что будет записано
//   node scripts/seed-shifts.mjs --apply     # записать
//
// Существующие смены НЕ трогаются: unique (instructor_id, date) из 0014 гасит
// повтор, а Prefer: resolution=ignore-duplicates превращает конфликт в
// «пропустить». Поэтому уже открытые сегодня смены останутся с их временем и
// фотографиями — скрипт добавляет только недостающие дни.
//
// Обратной стороны у этого нет: лишний день, которого в графике не должно быть,
// скрипт не уберёт. Снимать смену — руками в календаре админки, там же, где её
// видно.
//
// Работает без supabase-js, напрямую через HTTP API (как create-user.mjs).
// Ключи — из .env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
// ============================================================================

import { readFileSync } from "node:fs";

// ── График ──────────────────────────────────────────────────────────────────
// Месяц и кто в какие числа работает. Имена — как в таблице users.
//
// Август 2026, с фотографии от Дениса (prompts/schedule_august_2026.jpg).
// Пары работают через два дня: Денис с Евгением, Никита с Михаилом. Сергей
// (механик) выходит почти каждый день — у него выходные вразбивку.
const MONTH = "2026-08";

const SCHEDULE = {
  Денис: [1, 4, 5, 8, 9, 12, 13, 16, 17, 20, 21, 24, 25, 28, 29],
  Евгений: [1, 4, 5, 8, 9, 12, 13, 16, 17, 20, 21, 24, 25, 28, 29],
  Никита: [2, 3, 6, 7, 10, 11, 14, 15, 18, 19, 22, 23, 26, 27, 30, 31],
  Михаил: [2, 3, 6, 7, 10, 11, 14, 15, 18, 19, 22, 23, 26, 27, 30, 31],
  Сергей: [
    1, 2, 4, 5, 7, 8, 10, 11, 12, 14, 15, 17, 18, 19, 21, 22, 24, 25, 26, 28,
    29, 31,
  ],
};

// ── Окружение ───────────────────────────────────────────────────────────────
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
loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "Нет NEXT_PUBLIC_SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY (.env.local).",
  );
  process.exit(1);
}

const apply = process.argv.includes("--apply");

async function api(path, init = {}) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

const pad = (n) => String(n).padStart(2, "0");
const day = (d) => `${MONTH}-${pad(d)}`;

const main = async () => {
  // Люди графика → id. Имя в графике должно совпадать с users.name, иначе
  // молча уехали бы смены не тому человеку — поэтому падаем на несовпадении.
  const users = await api("users?select=id,name,role");
  const byName = new Map(users.map((u) => [u.name, u]));

  const rows = [];
  for (const [name, days] of Object.entries(SCHEDULE)) {
    const user = byName.get(name);
    if (!user) {
      console.error(
        `В базе нет пользователя «${name}». Есть: ${users.map((u) => u.name).join(", ")}`,
      );
      process.exit(1);
    }
    for (const d of days) rows.push({ instructor_id: user.id, date: day(d), name });
  }

  // Что уже стоит — чтобы в отчёте было видно, сколько строк реально новых.
  const existing = await api(
    `shifts?select=instructor_id,date&date=gte.${day(1)}&date=lte.${day(31)}`,
  );
  const has = new Set(existing.map((s) => `${s.instructor_id}|${s.date}`));

  // Таблица для сверки с фотографией: строка = день, столбцы = кто работает.
  const names = Object.keys(SCHEDULE);
  const width = Math.max(...names.map((n) => n.length));
  console.log(`\nГрафик ${MONTH} — ${rows.length} смен\n`);
  console.log(
    `дата         ${names.map((n) => n.padEnd(width)).join(" ")}`,
  );
  const lastDay = new Date(
    Date.UTC(Number(MONTH.slice(0, 4)), Number(MONTH.slice(5, 7)), 0),
  ).getUTCDate();
  for (let d = 1; d <= lastDay; d++) {
    const cells = names.map((n) => {
      const works = SCHEDULE[n].includes(d);
      if (!works) return "·".padEnd(width);
      const already = has.has(`${byName.get(n).id}|${day(d)}`);
      return (already ? "V (есть)" : "V").padEnd(width);
    });
    console.log(`${day(d)}   ${cells.join(" ")}`);
  }

  const fresh = rows.filter((r) => !has.has(`${r.instructor_id}|${r.date}`));
  console.log(
    `\nВсего в графике: ${rows.length} · уже в базе: ${rows.length - fresh.length} · добавим: ${fresh.length}`,
  );

  if (!apply) {
    console.log("\nЭто просмотр. Записать — тем же вызовом с --apply\n");
    return;
  }
  if (fresh.length === 0) {
    console.log("\nДобавлять нечего — весь график уже в базе.\n");
    return;
  }

  await api("shifts", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify(
      fresh.map(({ instructor_id, date }) => ({ instructor_id, date })),
    ),
  });
  console.log(`\nГотово: добавлено ${fresh.length} смен.\n`);
};

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
