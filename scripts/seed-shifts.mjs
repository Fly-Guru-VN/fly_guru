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
//   1. ПРОШЛОЕ НЕ ТРОГАЕМ ВООБЩЕ. Дни до сегодняшнего (а если задан FROM — до
//      него) — это отработанная история: там открытия, фотографии и уже
//      посчитанная ЗП. Расхождение с картинкой скрипт только покажет.
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
// Октябрь 2026 — график от 03.10.2026 (картинка «ГРАФИК ОКТЯБРЬ 2026»).
// Состав: Никита · Дмитрий · Руслан · Даниил (с 25.09). Сергей-механик уволен
// 01.10 и в график не входит. На пляже каждый день двое, пары идут по кругу
// через четыре дня: Никита+Дмитрий → Дмитрий+Руслан → Руслан+Даниил →
// Никита+Даниил.
const MONTH = "2026-10";

// Картинка начинается с 3-го, но 3-е — сегодняшний день, и смены на нём уже
// ОТКРЫТЫ (Руслан, Даниил — сходится с графиком). Ставим с 4-го, чтобы скрипт
// сегодняшний день не трогал вообще.
const FROM = "2026-10-04";

const SCHEDULE = {
  Никита: [5, 8, 9, 12, 13, 16, 17, 20, 21, 24, 25, 28, 29],
  Дмитрий: [5, 6, 9, 10, 13, 14, 17, 18, 21, 22, 25, 26, 29, 30],
  Руслан: [4, 6, 7, 10, 11, 14, 15, 18, 19, 22, 23, 26, 27, 30, 31],
  Даниил: [4, 7, 8, 11, 12, 15, 16, 19, 20, 23, 24, 27, 28, 31],
};

// Тёзки среди тех, кому ставят смены: чья роль имеется в виду. С 01.10 «Никита»
// двое — инструктор и новый СММщик; в графике пляжа — инструктор.
const ROLE_OF = { Никита: "instructor" };

// Кому вообще ставят смены. Нужно из-за тёзок: «Сергей» в users двое — механик
// и агент, и поиск просто по имени мог увести весь его график постороннему
// человеку (у кого строка попадётся в выборке последней — как повезёт).
const SHIFT_ROLES = ["instructor", "smm", "admin", "mechanic"];

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

// Сколько дней в месяце. Раньше нижняя граница выборки была прибита как day(31),
// и на 30-дневном месяце Postgres отвечал «date/time field value out of range:
// 2026-09-31» — скрипт падал ещё до первой строки графика.
const lastDay = new Date(
  Date.UTC(Number(MONTH.slice(0, 4)), Number(MONTH.slice(5, 7)), 0),
).getUTCDate();

const main = async () => {
  // Люди графика → id. Имя в графике должно совпадать с users.name, иначе
  // молча уехали бы смены не тому человеку — поэтому падаем на несовпадении.
  const users = await api("users?select=id,name,role");
  const byId = new Map(users.map((u) => [u.id, u.name]));

  // Только те, кому ставят смены (см. SHIFT_ROLES) — и при тёзках внутри этого
  // круга падаем, а не угадываем.
  const byName = new Map();
  for (const u of users.filter(
    (u) =>
      SHIFT_ROLES.includes(u.role) &&
      (!ROLE_OF[u.name] || ROLE_OF[u.name] === u.role),
  )) {
    if (byName.has(u.name)) {
      console.error(
        `В базе два «${u.name}» среди тех, кому ставят смены (${byName.get(u.name).role} и ${u.role}). Разведите имена или укажите роль в ROLE_OF — иначе смены уедут не тому.`,
      );
      process.exit(1);
    }
    byName.set(u.name, u);
  }

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
    `shifts?select=id,instructor_id,date,opened_at,closed_at&date=gte.${day(1)}&date=lte.${day(lastDay)}`,
  );
  const has = new Set(existing.map((s) => `${s.instructor_id}|${s.date}`));

  // Сегодняшний день по Вьетнаму (UTC+7) — граница «прошлое / будущее».
  // FROM двигает её вперёд, если график начинается позже сегодняшнего дня:
  // назад граница не сдвигается никогда, прошлое неприкосновенно.
  const vnToday = new Date(Date.now() + 7 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  const today = FROM && FROM > vnToday ? FROM : vnToday;
  const wanted = new Set(rows.map((r) => `${r.instructor_id}|${r.date}`));

  // Дни, которые график вообще описывает. Без FROM это весь месяц; с FROM —
  // только его хвост, и дни до него не показываем и не считаем расхождением:
  // график их просто не покрывает, а не противоречит базе.
  const covered = (d) => !FROM || d >= FROM;

  // Таблица для сверки с фотографией: строка = день, столбцы = кто работает.
  const names = Object.keys(SCHEDULE);
  const width = Math.max(...names.map((n) => n.length));
  console.log(`\nГрафик ${MONTH} — ${rows.length} смен\n`);
  console.log(
    `дата         ${names.map((n) => n.padEnd(width)).join(" ")}`,
  );
  for (let d = 1; d <= lastDay; d++) {
    if (!covered(day(d))) continue;
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
      .filter(
        (r) =>
          r.date < today &&
          covered(r.date) &&
          !has.has(`${r.instructor_id}|${r.date}`),
      )
      .map((r) => `${r.date} ${r.name} — в графике есть, в базе нет`),
    ...existing
      .filter(
        (s) =>
          s.date < today &&
          covered(s.date) &&
          !wanted.has(`${s.instructor_id}|${s.date}`),
      )
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
