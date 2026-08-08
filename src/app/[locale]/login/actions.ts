"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROLE_HOME, safeNextPath, type AppRole } from "@/lib/auth";
import { phoneDigits, phonesMatch } from "@/lib/phone";
import { vnToday } from "@/lib/dates";

// Вход по email ИЛИ телефону + пароль (архитектура, раздел 5: SMS не используем).
// Supabase логинит только по email, поэтому телефон сперва превращаем в email:
// ищем пользователя с таким номером в users и берём его email (у клиентов без
// настоящего email там лежит технический — см. scripts/create-user.mjs).

export interface LoginState {
  error: string | null;
}

// Телефон → email через сервисный ключ (пользователь ещё не залогинен,
// поэтому RLS его к users не пустит — резолвим на сервере).
async function resolveEmailByPhone(rawPhone: string): Promise<string | null> {
  const admin = createAdminClient();
  // Таблица users маленькая (персонал + члены клуба), поэтому просто
  // перебираем номера с гибким сравнением (последние 9 цифр).
  const { data } = await admin
    .from("users")
    .select("email, phone")
    .not("phone", "is", null);
  const found = (data ?? []).find((u) => phonesMatch(u.phone, rawPhone));
  return found?.email ?? null;
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const identifier = String(formData.get("identifier") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");

  if (!identifier || !password) {
    return { error: "Введите логин и пароль." };
  }

  let email: string | null;
  if (identifier.includes("@")) {
    email = identifier;
  } else if (phoneDigits(identifier).length >= 7) {
    email = await resolveEmailByPhone(identifier);
  } else {
    return { error: "Логин — это email или номер телефона." };
  }

  if (!email) {
    return { error: "Пользователь с таким номером не найден." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return { error: "Неверный логин или пароль." };
  }

  // Роль берём из БД (источник правды), а не из JWT: токен отстаёт, если роль
  // сменили после его выдачи, и тогда вход кидал бы, например, повышенного до
  // admin инструктора обратно в кабинет инструктора. JWT — только фолбэк.
  let dbRes = await supabase
    .from("users")
    .select("role, left_at")
    .eq("auth_id", data.user.id)
    .maybeSingle();
  // left_at появился в 0036 — до наката читаем без него.
  if (dbRes.error)
    dbRes = await supabase
      .from("users")
      .select("role")
      .eq("auth_id", data.user.id)
      .maybeSingle();
  const dbUser = dbRes.data as { role?: string; left_at?: string | null } | null;

  // Уволенный (0036): пароль верный, но в школе он больше не работает.
  // Аккаунт живёт дальше — на нём висит вся история занятий и выплат.
  if (dbUser?.left_at && vnToday() > dbUser.left_at) {
    await supabase.auth.signOut();
    return {
      error: "Доступ к кабинету закрыт: вы больше не числитесь в штате школы.",
    };
  }

  const role =
    (dbUser?.role as AppRole | undefined) ??
    (data.user.app_metadata?.role as AppRole | undefined) ??
    null;
  if (!role || !(role in ROLE_HOME)) {
    // Аккаунт есть в auth, но роль не проставлена — создан мимо скрипта.
    await supabase.auth.signOut();
    return { error: "Аккаунту не назначена роль. Напишите администратору." };
  }

  // Возврат туда, откуда выбросило на логин: только внутренние пути и только
  // не в чужой кабинет (правила и почему — в lib/auth → safeNextPath).
  redirect(safeNextPath(next, role));
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
