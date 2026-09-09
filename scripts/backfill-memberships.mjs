#!/usr/bin/env node
// ============================================================================
// Разовая выдача членства тем, у кого абонемент УЖЕ был.
//
// Зачем. С 09.09.2026 продажа абонемента принимает клиента в клуб сама — ровно
// то, что страница /club обещала гостю всё это время. Но людям, купившим
// абонемент раньше, членство никто не выдал: до сих пор его заводил админ
// руками, и делал это далеко не всегда. Этот скрипт подтягивает старых.
//
// Кому выдаём. Всем, у кого есть хоть один абонемент — в ЛЮБОМ статусе.
// Истёкший абонемент не отменяет того, что человек в клубе побывал: правило
// «членство навсегда» с сайта отменять мы не собирались.
//
// Дата вступления — день ПЕРВОЙ продажи, а не «сегодня». Иначе в карточке у
// человека, катающегося с июля, будет написано, что он в клубе с сентября.
//
// Ничего, кроме таблицы memberships, скрипт не трогает: ни абонементов, ни
// денег, ни уровней. Уже существующие членства не переписывает — их дата
// вступления могла быть выставлена админом осмысленно.
//
// Использование (из корня проекта):
//   node scripts/backfill-memberships.mjs            # показать, что сделает
//   node scripts/backfill-memberships.mjs --apply    # записать
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
    console.error(`Запрос не прошёл (${res.status}): ${await res.text()}`);
    process.exit(1);
  }
  return res.json();
};

// Абонементы по возрастанию даты продажи: первая встреченная строка клиента и
// есть его первая покупка, значит и дата вступления в клуб.
const subs = await get("subscriptions?select=client_id,sold_at&order=sold_at.asc");
const members = await get("memberships?select=client_id");
const clients = await get("clients?select=id,name,phone");

const nameOf = new Map(clients.map((c) => [c.id, c.name ?? "без имени"]));
const phoneOf = new Map(clients.map((c) => [c.id, c.phone]));
const already = new Set(members.map((m) => m.client_id));

const firstSale = new Map();
for (const s of subs) {
  if (!s.client_id) continue;
  if (!firstSale.has(s.client_id)) firstSale.set(s.client_id, s.sold_at);
}

const missing = [...firstSale.entries()].filter(([clientId]) => !already.has(clientId));

console.log(
  `Абонементы есть у ${firstSale.size} клиентов, из них в клубе уже ${
    firstSale.size - missing.length
  }.`,
);

if (missing.length === 0) {
  console.log("Выдавать нечего — все владельцы абонементов уже в клубе.");
  process.exit(0);
}

// Сортируем по дате вступления: так в выводе видно историю клуба сверху вниз.
missing.sort((a, b) => String(a[1]).localeCompare(String(b[1])));

const rows = [];
for (const [clientId, soldAt] of missing) {
  const day = String(soldAt).slice(0, 10);
  const phone = phoneOf.get(clientId);
  console.log(`+ ${nameOf.get(clientId) ?? clientId}${phone ? ` · ${phone}` : ""} — с ${day}`);
  rows.push({ client_id: clientId, since: soldAt });
}

if (args.apply) {
  // on_conflict + ignoreDuplicates: если между чтением и записью кто-то успел
  // продать абонемент этому же клиенту (продажа теперь заводит членство сама),
  // строка останется той, что записала продажа.
  const res = await fetch(
    `${url}/rest/v1/memberships?on_conflict=client_id`,
    {
      method: "POST",
      headers: { ...headers, Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify(rows),
    },
  );
  if (!res.ok) {
    console.error(`\nНе записалось (${res.status}): ${await res.text()}`);
    process.exit(1);
  }
  const written = await res.json();
  console.log(`\nИтого: принято в клуб ${written.length} из ${rows.length}.`);
} else {
  console.log(`\nИтого: ${rows.length} к выдаче. Это был показ — повторите с --apply.`);
}
