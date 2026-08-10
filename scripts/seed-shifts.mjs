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
// Скрипт СВОДИТ базу с графиком, а не только досыпает дни (правка от
// 10.08.2026 — Денис прислал новый график, и Никита с Евгением в базе стояли
// не в свои дни):
//   • нет в базе, есть в графике → добавить;
//   • есть в базе, нет в графике → снять.
//
// Три рубежа, чтобы ничего не потерять:
//   1. ПРОШЛОЕ НЕ ТРОГАЕМ ВООБЩЕ. Дни до сегодняшнего — это отработанная
//      история: там открытия, фотографии и уже посчитанная ЗП. Расхождение с
//      картинкой скрипт только покажет.
//   2. Снимаем лишь ПУСТЫЕ строки — где нет ни открытия, ни закрытия. Смену,
//      которую человек уже открыл, скрипт не удалит никогда.
//   3. Повтор при добавлении гасит unique (instructor_id, date) из 0014 плюс
//      Prefer: resolution=ignore-duplicates.
//
// Работает без supabase-js, напрямую через HTTP API (как create-user.mjs).
// Ключи — из .env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
// ============================================================================

import { readFileSync } from "node:fs";

// ── График ──────────────────────────────────────────────────────────────────
// Месяц и кто в какие числа работает. Имена — как в таблице users.
//
// Август 2026 — график от 10.08.2026 (картинка «ГРАФИК АВГУСТ 2026»). Он
// заменил июльскую раскладку: Михаил уволился 4 августа, и пары «через два
// дня» рассыпались — теперь каждый ходит по своему рисунку, а на пляже почти
// всегда трое. Сергей (механик) выходит почти каждый день, выходные вразбивку.
const MONTH = "2026-08";

const SCHEDULE = {
  Денис: [1, 4, 5, 7, 8, 9, 11, 13, 14, 16, 17, 19, 20, 22, 23, 25, 26, 28, 29, 31],
  Никита: [2, 3, 6, 7, 9, 10, 11, 12, 14, 15, 18, 20, 21, 23, 24, 26, 27, 29, 30],
  Евгений: [
    1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 15, 16, 18, 19, 21, 22, 24, 25, 27, 28, 30,
    31,
  ],
  Сергей: [
    1, 2, 4, 5, 7, 8, 10, 11, 12, 14, 15, 17, 18, 19, 20, 21, 22, 24, 25, 26,
    28, 29, 31,
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
  const byId = new Map(users.map((u) => [u.id, u.name]));

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

  // Что уже стоит — и с открытиями: по ним решаем, можно ли строку снимать.
  const existing = await api(
    `shifts?select=id,instructor_id,date,opened_at,closed_at&date=gte.${day(1)}&date=lte.${day(31)}`,
  );
  const has = new Set(existing.map((s) => `${s.instructor_id}|${s.date}`));

  // Сегодняшний день по Вьетнаму (UTC+7) — граница «прошлое / будущее».
  const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const wanted = new Set(rows.map((r) => `${r.instructor_id}|${r.date}`));

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
      const already = has.has(`${byName.get(n).id}|${day(d)}`);
      if (!works) return (already ? "снять" : "·").padEnd(width);
      return (already ? "V (есть)" : "V (+)").padEnd(width);
    });
    console.log(`${day(d)}   ${cells.join(" ")}`);
  }

  // Добавляем только начиная с сегодняшнего дня: дорисовывать смены в уже
  // прошедшие числа нельзя — это выдумывать людям выходы задним числом.
  const fresh = rows.filter(
    (r) => !has.has(`${r.instructor_id}|${r.date}`) && r.date >= today,
  );

  // Снимаем лишнее — только пустые строки и только с сегодняшнего дня.
  const stale = existing.filter(
    (s) =>
      !wanted.has(`${s.instructor_id}|${s.date}`) &&
      s.date >= today &&
      !s.opened_at &&
      !s.closed_at,
  );

  // Что разошлось в прошлом — сказать, но не трогать: там уже история.
  const pastMismatch = [
    ...rows
      .filter((r) => r.date < today && !has.has(`${r.instructor_id}|${r.date}`))
      .map((r) => `${r.date} ${r.name} — в графике есть, в базе нет`),
    ...existing
      .filter((s) => s.date < today && !wanted.has(`${s.instructor_id}|${s.date}`))
      .map(
        (s) =>
          `${s.date} ${byId.get(s.instructor_id) ?? "?"} — в базе есть, в графике нет${
            s.opened_at ? " (смена отработана)" : ""
          }`,
      ),
  ].sort();

  console.log(
    `\nВсего в графике: ${rows.length} · добавим: ${fresh.length} · снимем: ${stale.length}`,
  );
  for (const r of fresh) console.log(`  + ${r.date} ${r.name}`);
  for (const s of stale)
    console.log(`  − ${s.date} ${byId.get(s.instructor_id) ?? "?"}`);

  if (pastMismatch.length > 0) {
    console.log(`\nПрошедшие дни (не трогаем, только к сведению):`);
    for (const line of pastMismatch) console.log(`  · ${line}`);
  }

  if (!apply) {
    console.log("\nЭто просмотр. Записать — тем же вызовом с --apply\n");
    return;
  }
  if (fresh.length === 0 && stale.length === 0) {
    console.log("\nМенять нечего — база уже сходится с графиком.\n");
    return;
  }

  if (fresh.length > 0) {
    await api("shifts", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify(
        fresh.map(({ instructor_id, date }) => ({ instructor_id, date })),
      ),
    });
  }
  for (const s of stale) {
    await api(`shifts?id=eq.${s.id}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
  }
  console.log(
    `\nГотово: добавлено ${fresh.length}, снято ${stale.length}.\n`,
  );
};

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
