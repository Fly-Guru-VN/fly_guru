#!/usr/bin/env node
// ============================================================================
// Выдать агенту вход в кабинет /agent (0049).
//
// Использование (из корня проекта):
//   node scripts/grant-agent-login.mjs --code AB12CD --email hung@example.com \
//     --password "секрет"
//
//   node scripts/grant-agent-login.mjs --name "Хунг" --phone "+84 90 123 4567" \
//     --password "секрет"
//
// Чем отличается от create-user.mjs. Тот заводит человека С НУЛЯ — и auth, и
// строку в users. У агента строка в users УЖЕ есть: её создала админка вместе
// с реф-кодом, только без auth_id — войти по ней было нельзя. Этот скрипт
// достраивает недостающее: делает auth-аккаунт и привязывает его к
// существующей строке. Если бы мы позвали create-user.mjs, в базе появился бы
// второй «тот же» агент — с новым id, без кода и без наград.
//
// Найти агента можно по реф-коду (--code) или по имени (--name).
// Email можно не указывать: тогда он генерится из телефона, как у сотрудников
// (84901234567@phone.flyguru.local), и агент входит по телефону.
//
// Ключи берутся из .env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
// ============================================================================

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

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
    code: { type: "string" },
    name: { type: "string" },
    email: { type: "string" },
    phone: { type: "string" },
    password: { type: "string" },
  },
});

if ((!args.code && !args.name) || !args.password) {
  console.error(
    "Обязательно: --password и один из --code (реф-код) / --name (имя агента).\n" +
      "Необязательно: --email, --phone.",
  );
  process.exit(1);
}

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};

const get = async (path) => {
  const res = await fetch(`${url}/rest/v1/${path}`, { headers });
  if (!res.ok) {
    console.error("Ошибка чтения базы:", await res.text());
    process.exit(1);
  }
  return res.json();
};

// ── Шаг 1: находим агента и его строку в users ──
const query = args.code
  ? `agents?ref_code=eq.${encodeURIComponent(args.code)}&select=id,ref_code,user_id,user:users!user_id(id,name,email,phone,auth_id)`
  : `agents?select=id,ref_code,user_id,user:users!user_id(id,name,email,phone,auth_id)`;
const agents = await get(query);

const matched = args.code
  ? agents
  : agents.filter(
      (a) =>
        (a.user?.name ?? "").toLowerCase() === args.name.toLowerCase(),
    );

if (matched.length === 0) {
  console.error("Агент не найден. Проверьте --code или --name (имя целиком, как в админке).");
  process.exit(1);
}
if (matched.length > 1) {
  console.error("Под это имя подходит несколько агентов — укажите --code:");
  for (const a of matched) console.error(`   ${a.user?.name} · ${a.ref_code}`);
  process.exit(1);
}

const agent = matched[0];
const person = agent.user;
if (!person) {
  console.error("У агента нет строки в users — заведите его заново в админке.");
  process.exit(1);
}
if (person.auth_id) {
  console.error(
    `У «${person.name}» вход уже есть (${person.email ?? "email не записан"}).\n` +
      "Сменить пароль: node scripts/set-password.mjs",
  );
  process.exit(1);
}

// ── Шаг 2: email для входа ──
const phoneDigits = (args.phone ?? person.phone ?? "").replace(/\D/g, "");
const email =
  args.email ?? (phoneDigits ? `${phoneDigits}@phone.flyguru.local` : null);
if (!email) {
  console.error("У агента не записан телефон — укажите --email или --phone.");
  process.exit(1);
}

// ── Шаг 3: auth-аккаунт ──
const authRes = await fetch(`${url}/auth/v1/admin/users`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    email,
    password: args.password,
    email_confirm: true, // подтверждение почты не нужно — доступы раздаём сами
    app_metadata: { role: "agent" },
    user_metadata: { name: person.name },
  }),
});
const authBody = await authRes.json().catch(() => ({}));
if (!authRes.ok || !authBody.id) {
  console.error("Ошибка auth:", authBody.msg ?? authBody.message ?? authRes.status);
  process.exit(1);
}

// ── Шаг 4: привязываем аккаунт к строке агента ──
const patchRes = await fetch(
  `${url}/rest/v1/users?id=eq.${encodeURIComponent(person.id)}`,
  {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify({
      auth_id: authBody.id,
      email,
      role: "agent", // на случай, если строку заводили руками с другой ролью
      ...(phoneDigits ? { phone: phoneDigits } : {}),
    }),
  },
);
if (!patchRes.ok) {
  console.error("Auth-аккаунт создан, но привязать его к агенту не удалось:", await patchRes.text());
  console.error("Удалите пользователя в Supabase-дашборде (Authentication → Users) и попробуйте снова.");
  process.exit(1);
}

console.log(`✅ Агент «${person.name}» (${agent.ref_code}) теперь может войти.`);
console.log(`   Логин: ${args.phone ?? person.phone ?? email}`);
console.log(`   Пароль: ${args.password}`);
console.log(`   Вход: /login → кабинет /agent`);
