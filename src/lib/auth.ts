import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// «Кто сейчас залогинен» для серверных компонентов и server actions.
//
// Роль хранится в двух местах: в JWT (app_metadata.role — для быстрых проверок
// в middleware) и в таблице users (источник правды). Здесь читаем users:
// кабинетам нужны и id, и имя.

export type AppRole = "admin" | "instructor" | "mechanic" | "member" | "agent";

export interface AppUser {
  id: string; // users.id — им подписываются sessions/subscriptions
  role: AppRole;
  name: string;
  phone: string | null;
  email: string | null;
  photo_url: string | null;
  age: number | null;
  monthly_goal: number | null; // личная цель по ЗП на месяц, ₫
}

// Домашняя страница каждой роли (куда отправлять после входа).
export const ROLE_HOME: Record<AppRole, string> = {
  admin: "/admin",
  instructor: "/instructor",
  mechanic: "/mechanic",
  member: "/member",
  agent: "/agent",
};

// Возвращает пользователя приложения или null (не залогинен / нет строки в users).
// cache(): layout и страница вызывают getAppUser в одном запросе — без кеша это
// два похода в Supabase Auth + два чтения users (по ~200+ мс каждый, база в
// другом регионе). С кешом результат в рамках одного HTTP-запроса общий.
export const getAppUser = cache(async (): Promise<AppUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // RLS: политика users_select_own разрешает читать только свою строку.
  const { data } = await supabase
    .from("users")
    .select("id, role, name, phone, email, photo_url, age, monthly_goal")
    .eq("auth_id", user.id)
    .maybeSingle();
  if (!data) return null;

  return data as AppUser;
});

// Куда отправить человека сразу после входа.
//
// По умолчанию — назад туда, откуда его выбросило на логин (?next=). Но в
// чужой кабинет по этой ссылке не пускаем, даже если роль формально разрешает:
// админ, ткнувший в закладку /instructor, логинился и оказывался в кабинете
// инструктора со своим же именем и кнопкой «Открыть смену» — выглядело так,
// будто у аккаунта слетела роль. Свой кабинет надёжнее; в чужой админ и так
// зайдёт по прямой ссылке, уже понимая, куда идёт.
export function safeNextPath(next: string, role: AppRole): string {
  // Только внутренние пути: «/» и один символ, который не слэш и не бэкслэш.
  // Так отсекаются и «//evil», и «/\evil» — браузер трактует «\» как «/»,
  // и без этой проверки был открытый редирект.
  if (!/^\/[^/\\]/.test(next)) return ROLE_HOME[role];

  // Языковой префикс (/en/instructor) снимаем: раздел — следующий сегмент.
  const parts = next.split("/").filter(Boolean);
  const section = parts[0] && parts[0] in ROLE_HOME ? parts[0] : parts[1];

  if (section && section in ROLE_HOME && section !== role) return ROLE_HOME[role];
  return next;
}

// Защита страницы кабинета: не залогинен → на /login (с возвратом обратно),
// чужая роль → в свой кабинет. Админ может заходить в любой кабинет.
export async function requireRole(role: AppRole, currentPath: string): Promise<AppUser> {
  const user = await getAppUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(currentPath)}`);
  if (user.role !== role && user.role !== "admin") redirect(ROLE_HOME[user.role]);
  return user;
}
