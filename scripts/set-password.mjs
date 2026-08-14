#!/usr/bin/env node
// ============================================================================
// Смена пароля пользователю FlyGuru (без письма и без участия самого человека).
//
// Использование (из корня проекта):
//   node scripts/set-password.mjs --email roman@example.com --password "секрет"
//   node scripts/set-password.mjs --phone "+84 90 123 4567" --password "секрет"
//
// Когда нужно: человек потерял доступ к почте, письмо не доходит, или пароль
// надо сменить прямо сейчас. Обычный путь для сотрудников — «Забыли пароль?»
// на странице входа, там человек задаёт пароль сам.
//
// Важно: правила паролей из Supabase (минимальная длина, проверка по базам
// утечек) действуют и здесь — слабый пароль сервер не примет.
//
// Работает без библиотеки supabase-js — напрямую через HTTP API Supabase.
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

// ── Аргументы ──
const { values: args } = parseArgs({
  options: {
    email: { type: "string" },
    phone: { type: "string" },
    password: { type: "string" },
  },
});

if ((!args.email && !args.phone) || !args.password) {
  console.error(
    "Обязательно: --password и одно из --email / --phone.\n" +
      'Пример: node scripts/set-password.mjs --email roman@example.com --password "секрет"',
  );
  process.exit(1);
}

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};

// ── Шаг 1: находим человека в таблице users ──
// Ищем именно здесь, а не в auth: тут есть и телефон, и имя — можно показать,
// кому меняем пароль, и не промахнуться. auth_id — ссылка на аккаунт входа.
// Телефон в базе лежит только цифрами (см. create-user.mjs), поэтому и ищем
// по последним 9 цифрам: +84 90 123 4567 и 0901234567 — один и тот же номер.
const query = args.email
  ? `email=eq.${encodeURIComponent(args.email)}`
  : `phone=like.*${(args.phone ?? "").replace(/\D/g, "").slice(-9)}`;

const findRes = await fetch(`${url}/rest/v1/users?${query}&select=id,name,role,email,phone,auth_id`, {
  headers,
});
const found = await findRes.json().catch(() => []);
if (!findRes.ok || !Array.isArray(found) || found.length === 0) {
  console.error("Пользователь не найден. Проверьте email или телефон.");
  process.exit(1);
}
if (found.length > 1) {
  console.error("Под это условие подходит несколько человек — уточните email:");
  for (const u of found) console.error(`  • ${u.name} (${u.role}) — ${u.email}`);
  process.exit(1);
}

const user = found[0];
if (!user.auth_id) {
  console.error(`У «${user.name}» нет аккаунта входа (auth_id пустой) — менять нечего.`);
  process.exit(1);
}

// ── Шаг 2: ставим новый пароль (GoTrue Admin API) ──
const putRes = await fetch(`${url}/auth/v1/admin/users/${user.auth_id}`, {
  method: "PUT",
  headers,
  body: JSON.stringify({ password: args.password }),
});
const putBody = await putRes.json().catch(() => ({}));
if (!putRes.ok) {
  // Сюда же прилетают отказы по правилам паролей: слишком короткий или
  // засветившийся в утечках.
  console.error("Не удалось сменить пароль:", putBody.msg ?? putBody.message ?? putRes.status);
  process.exit(1);
}

console.log(`✅ Пароль изменён: ${user.name} (${user.role}).`);
console.log(`   Логин: ${user.phone ? `${user.phone} или ${user.email}` : user.email}`);
console.log(`   Пароль: ${args.password}`);
console.log(`   Вход: /login`);
