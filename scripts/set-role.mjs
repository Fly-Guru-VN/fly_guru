#!/usr/bin/env node
// ============================================================================
// Смена роли существующего пользователя FlyGuru.
//
// Роль в FlyGuru хранится в ДВУХ местах: в JWT (app_metadata.role — по нему
// судит middleware) и в users.role (источник правды для страниц и RLS). В самом
// приложении роль после создания аккаунта не меняется, поэтому «повышение»
// правкой одной только таблицы users оставляло JWT со старой ролью — и middleware
// выкидывал, например, повышенного до admin инструктора обратно в /instructor.
// Этот скрипт меняет роль СРАЗУ в обоих местах, чтобы они не разъезжались.
//
// Использование (из корня проекта):
//   node scripts/set-role.mjs --role admin --email boss@example.com
//   node scripts/set-role.mjs --role admin --phone "+84 90 123 4567"
//
// После смены пользователь должен ВЫЙТИ и ЗАЙТИ заново — свежий JWT выдаётся
// только при новом входе (или следующем обновлении токена).
//
// Ключи берутся из .env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
// ============================================================================

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

// ── Читаем .env.local (простой парсер: KEY=VALUE построчно) ──
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
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Нет NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (см. .env.local).");
  process.exit(1);
}

const { values: args } = parseArgs({
  options: {
    role: { type: "string" },
    email: { type: "string" },
    phone: { type: "string" },
  },
});

const ROLES = ["admin", "instructor", "mechanic", "smm", "member", "agent"];
if (!args.role || !ROLES.includes(args.role) || (!args.email && !args.phone)) {
  console.error(
    "Обязательно: --role (admin|instructor|mechanic|smm|member|agent) и --email ИЛИ --phone.",
  );
  process.exit(1);
}

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};

// ── Шаг 1: найти пользователя в таблице users (service_role обходит RLS) ──
// По email — точное совпадение; по телефону — по последним 9 цифрам (как в
// приложении: номера хранятся «как ввели»).
let usersRes;
if (args.email) {
  usersRes = await fetch(
    `${url}/rest/v1/users?select=auth_id,name,email,phone,role&email=eq.${encodeURIComponent(args.email)}`,
    { headers },
  );
} else {
  usersRes = await fetch(
    `${url}/rest/v1/users?select=auth_id,name,email,phone,role&phone=not.is.null`,
    { headers },
  );
}
const rows = await usersRes.json().catch(() => []);
if (!usersRes.ok) {
  console.error("Ошибка чтения users:", rows?.message ?? usersRes.status);
  process.exit(1);
}

let user;
if (args.email) {
  user = rows[0];
} else {
  const wanted = args.phone.replace(/\D/g, "").slice(-9);
  user = rows.find((u) => (u.phone ?? "").replace(/\D/g, "").slice(-9) === wanted);
}

if (!user || !user.auth_id) {
  console.error("Пользователь не найден (или у него нет auth-аккаунта).");
  process.exit(1);
}
if (user.role === args.role) {
  console.log(`У «${user.name}» роль уже ${args.role} — обновлю на всякий случай JWT.`);
}

// ── Шаг 2: роль в JWT (GoTrue Admin API мержит app_metadata) ──
const authRes = await fetch(`${url}/auth/v1/admin/users/${user.auth_id}`, {
  method: "PUT",
  headers,
  body: JSON.stringify({ app_metadata: { role: args.role } }),
});
if (!authRes.ok) {
  const body = await authRes.json().catch(() => ({}));
  console.error("Ошибка обновления JWT:", body?.msg ?? body?.message ?? authRes.status);
  process.exit(1);
}

// ── Шаг 3: роль в users (источник правды) ──
const dbRes = await fetch(`${url}/rest/v1/users?auth_id=eq.${user.auth_id}`, {
  method: "PATCH",
  headers: { ...headers, Prefer: "return=minimal" },
  body: JSON.stringify({ role: args.role }),
});
if (!dbRes.ok) {
  const body = await dbRes.json().catch(() => ({}));
  console.error("Ошибка обновления users.role:", body?.message ?? dbRes.status);
  process.exit(1);
}

console.log(`✔ «${user.name}» → роль ${args.role} (JWT + users).`);
console.log("Важно: пусть выйдет и зайдёт заново — новый токен выдаётся при входе.");
