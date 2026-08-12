#!/usr/bin/env node
// ============================================================================
// Разовая привязка СТАРЫХ заявок к их занятиям (миграция 0038).
//
// Зачем. До 0038 связи между заявкой и занятием не существовало: «Записать
// клиента» помечало заявку выполненной и отдельно писало сессию. После наката
// новые заявки связываются сами, а закрытые раньше остаются без связи — в
// ленте у них висит подсказка «Занятие не привязано». Этот скрипт проставляет
// связь задним числом.
//
// Как ищем пару. Берём заявки со статусом done/archived, у которых есть клиент
// и нет session_id, и подбираем занятие ТОГО ЖЕ клиента с датой в пределах
// ±3 дней от даты заявки. Если подходит ровно одно — связываем. Если ноль или
// несколько — не гадаем: печатаем строку и оставляем человеку (в ленте заявок
// есть кнопка «Клиент учтён в другом занятии»).
//
// Ничего, кроме session_id, скрипт не трогает: ни статусов, ни денег.
//
// Использование (из корня проекта):
//   node scripts/backfill-booking-sessions.mjs            # показать, что сделает
//   node scripts/backfill-booking-sessions.mjs --apply    # записать
//
// Ключи берутся из .env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
// ============================================================================

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Нет NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (см. .env.local).");
  process.exit(1);
}

const { values: args } = parseArgs({ options: { apply: { type: "boolean" } } });
const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};

const get = async (path) => {
  const res = await fetch(`${url}/rest/v1/${path}`, { headers });
  if (!res.ok) {
    const body = await res.text();
    // Самая частая причина запустить скрипт и получить отказ — забытая
    // миграция. Говорим об этом прямо, а не кодом ошибки PostgREST.
    if (body.includes("session_id does not exist")) {
      console.error(
        "В базе нет колонки bookings.session_id — сначала накатите миграцию\n" +
          "supabase/migrations/0038_booking_session_link.sql через SQL Editor.",
      );
      process.exit(1);
    }
    console.error(`Запрос не прошёл (${res.status}): ${body}`);
    process.exit(1);
  }
  return res.json();
};

// Даты сравниваем как строки 'YYYY-MM-DD' — сдвиг считаем через Date в UTC.
const shift = (day, days) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const bookings = await get(
  "bookings?select=id,booking_no,client_name,client_id,service_id,preferred_date,created_at,status,session_id,subscription_id" +
    "&status=in.(done,archived)&client_id=not.is.null&session_id=is.null&subscription_id=is.null" +
    "&order=booking_no",
);

if (bookings.length === 0) {
  console.log("Заявок без привязанного занятия нет — делать нечего.");
  process.exit(0);
}

const sessions = await get("sessions?select=id,client_id,date,amount,service_id&order=date");

let linked = 0;
let skipped = 0;

for (const b of bookings) {
  const anchor = b.preferred_date ?? b.created_at.slice(0, 10);
  const from = shift(anchor, -3);
  const to = shift(anchor, 3);
  let candidates = sessions.filter(
    (s) => s.client_id === b.client_id && s.date >= from && s.date <= to,
  );

  // Один клиент за день мог откатать несколько занятий (мама с дочкой —
  // тандем взрослый и тандем детский). Тогда пару определяет услуга: заявка
  // на детский тандем закрывается детским тандемом, а не взрослым. Сужаем
  // только если это даёт единственный вариант, иначе гадать не начинаем —
  // у парного обучения услуга занятия НАМЕРЕННО другая, чем в заявке.
  if (candidates.length > 1 && b.service_id) {
    const sameService = candidates.filter((s) => s.service_id === b.service_id);
    if (sameService.length === 1) candidates = sameService;
  }

  const label = `#${b.booking_no ?? "?"} ${b.client_name} (${anchor})`;
  if (candidates.length !== 1) {
    console.log(
      `— ${label}: подходящих занятий ${candidates.length} — пропускаю, привяжите руками в ленте заявок.`,
    );
    skipped += 1;
    continue;
  }

  const s = candidates[0];
  console.log(`✓ ${label} → занятие ${s.date}, ${s.amount} ₫`);
  linked += 1;

  if (args.apply) {
    const res = await fetch(`${url}/rest/v1/bookings?id=eq.${b.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ session_id: s.id }),
    });
    if (!res.ok) {
      console.error(`  не записалось: ${res.status} ${await res.text()}`);
    }
  }
}

console.log(
  `\nИтого: ${linked} к привязке, ${skipped} на ручной разбор.` +
    (args.apply ? " Записано." : " Это был показ — повторите с --apply."),
);
