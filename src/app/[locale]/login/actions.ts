"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROLE_HOME, safeNextPath, type AppRole } from "@/lib/auth";
import { phoneDigits, phonesMatch } from "@/lib/phone";
import { vnToday } from "@/lib/dates";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";
import { SITE_URL } from "@/lib/site";
import { loginRateKey, passwordResetOrigin } from "@/lib/loginSecurity";

// Вход по email ИЛИ телефону + пароль (архитектура, раздел 5: SMS не используем).
// Supabase логинит только по email, поэтому телефон сперва превращаем в email:
// ищем пользователя с таким номером в users и берём его email (у клиентов без
// настоящего email там лежит технический — см. scripts/create-user.mjs).

export interface LoginState {
  error: string | null;
}

const LOGIN_FAILED = "Неверный логин или пароль.";
const LOGIN_MAX_PER_IP = 10;
const LOGIN_MAX_PER_ACCOUNT = 5;

// Телефон → email через сервисный ключ (пользователь ещё не залогинен,
// поэтому RLS его к users не пустит — резолвим на сервере).
async function resolveEmailByPhone(rawPhone: string): Promise<string | null> {
  const admin = createAdminClient();
  // Таблица users маленькая (персонал + члены клуба), поэтому просто
  // перебираем номера с гибким сравнением (последние 9 цифр).
  const { data, error } = await admin
    .from("users")
    .select("email, phone")
    .not("phone", "is", null);
  if (error) throw new Error(`users lookup failed: ${error.message}`);
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

  // Два независимых барьера: один IP не перебирает много аккаунтов, один
  // аккаунт не перебирают с пачки адресов. Это мягкий per-instance лимит;
  // строгий распределённый барьер потребует общего хранилища (rateLimit.ts).
  const head = await headers();
  const allowedByIp = checkRateLimit(
    `login-ip:${clientIp(head)}`,
    LOGIN_MAX_PER_IP,
  );
  const allowedByAccount = checkRateLimit(
    `login-account:${loginRateKey(identifier)}`,
    LOGIN_MAX_PER_ACCOUNT,
  );
  if (!allowedByIp || !allowedByAccount) {
    return { error: "Слишком много попыток. Подождите минуту." };
  }

  let email: string | null;
  if (identifier.includes("@")) {
    email = identifier;
  } else if (phoneDigits(identifier).length >= 7) {
    try {
      email = await resolveEmailByPhone(identifier);
    } catch (error) {
      console.error("[login] phone lookup error:", error);
      return { error: "Не удалось проверить доступ. Попробуйте ещё раз." };
    }
  } else {
    return { error: "Логин — это email или номер телефона." };
  }

  if (!email) {
    // Не подтверждаем постороннему, зарегистрирован ли такой телефон.
    return { error: LOGIN_FAILED };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return { error: LOGIN_FAILED };
  }

  // Роль берём из БД (источник правды), а не из JWT: токен отстаёт, если роль
  // сменили после его выдачи, и тогда вход кидал бы, например, повышенного до
  // admin инструктора обратно в кабинет инструктора.
  const dbRes = await supabase
    .from("users")
    .select("role, left_at")
    .eq("auth_id", data.user.id)
    .maybeSingle();
  // Ошибка чтения роли/увольнения должна закрывать вход. Старый повтор без
  // left_at удалён: он превращал любой сбой БД в «сотрудник не уволен».
  if (dbRes.error) {
    console.error("[login] app user lookup error:", dbRes.error.message);
    await supabase.auth.signOut();
    return { error: "Не удалось проверить доступ. Попробуйте ещё раз." };
  }
  const dbUser = dbRes.data as { role?: string; left_at?: string | null } | null;

  // Уволенный (0036): пароль верный, но в школе он больше не работает.
  // Аккаунт живёт дальше — на нём висит вся история занятий и выплат.
  if (dbUser?.left_at && vnToday() >= dbUser.left_at) {
    await supabase.auth.signOut();
    return {
      error: "Доступ к кабинету закрыт: вы больше не числитесь в штате школы.",
    };
  }

  // JWT здесь не фолбэк: токен может отстать от таблицы users, а строка в БД
  // является обязательным источником роли и статуса сотрудника.
  const role = (dbUser?.role as AppRole | undefined) ?? null;
  if (!role || !(role in ROLE_HOME)) {
    // Аккаунт есть в auth, но роль не проставлена — создан мимо скрипта.
    await supabase.auth.signOut();
    return { error: "Аккаунту не назначена роль. Напишите администратору." };
  }

  // Возврат туда, откуда выбросило на логин: только внутренние пути и только
  // не в чужой кабинет (правила и почему — в lib/auth → safeNextPath).
  redirect(safeNextPath(next, role));
}

// ── Забыли пароль ───────────────────────────────────────────────────────────
// Отправляем письмо со ссылкой на /reset-password. Логин тут тот же, что и на
// входе: email или телефон.

export interface ResetRequestState {
  error: string | null;
  sent: boolean;
}

// Технические email из телефона (см. scripts/create-user.mjs) — почтовый ящик
// не существует, письму просто некуда идти.
const TECH_EMAIL_SUFFIX = "@phone.flyguru.local";

export async function requestPasswordResetAction(
  _prev: ResetRequestState,
  formData: FormData,
): Promise<ResetRequestState> {
  const identifier = String(formData.get("identifier") ?? "").trim();
  if (!identifier) {
    return { error: "Введите email или телефон.", sent: false };
  }

  const head = await headers();
  // Письмо стоит денег и нервов адресату — три запроса в минуту с адреса хватит
  // с запасом. Заодно отсекает перебор чужих email через эту форму.
  if (!checkRateLimit(`reset:${clientIp(head)}`, 3)) {
    return { error: "Слишком много попыток. Подождите минуту.", sent: false };
  }

  let email: string | null;
  if (identifier.includes("@")) {
    email = identifier;
  } else if (phoneDigits(identifier).length >= 7) {
    try {
      email = await resolveEmailByPhone(identifier);
    } catch (error) {
      console.error("[password reset] phone lookup error:", error);
      return {
        error: "Сервис временно недоступен. Попробуйте ещё раз.",
        sent: false,
      };
    }
  } else {
    return { error: "Логин — это email или номер телефона.", sent: false };
  }

  if (email?.endsWith(TECH_EMAIL_SUFFIX)) {
    // Технический адрес не является почтовым ящиком, но отдельный ответ
    // подтвердил бы постороннему, что введённый телефон зарегистрирован.
    // Возвращаем тот же результат, что для неизвестного аккаунта, и ничего
    // никуда не отправляем. Нейтральная подсказка про администратора есть в UI.
    email = null;
  }

  if (email) {
    // В production не доверяем Host из запроса: security-ссылка всегда ведёт
    // на канонический сайт. Helper разрешает localhost только при разработке.
    const origin = passwordResetOrigin(head, SITE_URL);

    // Здесь намеренно НЕ наш обычный серверный клиент. Он собран поверх
    // @supabase/ssr, а тот принудительно включает режим PKCE: ссылка в письме
    // работает только в том браузере, откуда сброс запросили (секрет остаётся
    // у него в куке). Человек запросил на телефоне, открыл письмо в приложении
    // почты — там свой встроенный браузер, и ссылка мертва. Обычный клиент
    // supabase-js шлёт ссылку с токеном прямо в адресе: открывается откуда
    // угодно. Сессия ему не нужна, поэтому и не храним её.
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    // Ошибку не показываем клиенту: разный ответ выдал бы существование email.
    // Но обязательно пишем её в серверный лог, иначе поломка SMTP невидима.
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/reset-password`,
    });
    if (error) {
      console.error("[password reset] send error:", error.message);
    }
  }

  // Ответ одинаковый и когда аккаунт нашёлся, и когда нет. Иначе форма
  // превращается в справочную: набрал чужой email — и узнал, работает ли
  // человек в школе.
  return { error: null, sent: true };
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
