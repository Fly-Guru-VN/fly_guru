import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { vnToday } from "@/lib/dates";

// «Кто сейчас залогинен» для серверных компонентов и server actions.
//
// Роль хранится в двух местах: в JWT (app_metadata.role — для быстрых проверок
// в middleware) и в таблице users (источник правды). Здесь читаем users:
// кабинетам нужны и id, и имя.

export type AppRole =
  | "admin"
  | "dev"
  | "instructor"
  | "mechanic"
  | "smm"
  | "member"
  | "agent";

export interface AppUser {
  id: string; // users.id — им подписываются sessions/subscriptions
  role: AppRole;
  name: string;
  phone: string | null;
  email: string | null;
  photo_url: string | null;
  age: number | null;
  monthly_goal: number | null; // личная цель по ЗП на месяц, ₫
  left_at: string | null; // последний рабочий день уволенного (0036)
}

// Уволенный (дата последнего рабочего дня уже прошла). Аккаунт не удаляем —
// вместе с ним пропала бы вся история занятий и выплат, — но в кабинет не
// пускаем: человек больше не работает в школе.
export function isLeftStaff(user: { left_at: string | null }): boolean {
  return Boolean(user.left_at && vnToday() > user.left_at);
}

// Домашняя страница каждой роли (куда отправлять после входа).
export const ROLE_HOME: Record<AppRole, string> = {
  admin: "/admin",
  // Разработчик работает в админском кабинете: у него те же права и те же
  // разделы, отдельного набора экранов заводить незачем (0044). Своя у него
  // только строка в расчёте ЗП — фикс за неделю плюс 1% с оборота.
  dev: "/admin",
  instructor: "/instructor",
  mechanic: "/mechanic",
  smm: "/smm",
  member: "/member",
  agent: "/agent",
};

// Кабинет «офиса»: админ, разработчик и СММщик работают с одними и теми же
// разделами (0039, 0044). Кабинет СММщика — те же экраны, но по адресам /smm и
// с урезанным меню: календаря, выплат, услуг и членов клуба у него нет.
// Разработчик работает прямо в /admin — у него полные права админа.
const OFFICE_ROLES: AppRole[] = ["admin", "dev", "smm"];

// «Хозяин админки»: админ школы и разработчик. Права у них одинаковые — и в
// коде, и в базе (0045 подменяет роль на 'admin' для всех политик RLS).
// Различать их нужно только там, где речь о деньгах: ЗП начисляется dev'у,
// а не админу.
export function isAdminLike(role: AppRole): boolean {
  return role === "admin" || role === "dev";
}

export function isOffice(role: AppRole): boolean {
  return OFFICE_ROLES.includes(role);
}

// Базовый путь кабинета, в котором человек сейчас работает. Экраны админки
// переиспользуются СММщиком, и ссылки внутри них должны вести в ЕГО кабинет,
// а не в /admin, куда его не пустит middleware.
export function cabinetBase(role: AppRole): string {
  return ROLE_HOME[role] ?? "/admin";
}

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
  // Страховка «а вдруг 0036 не накатана» убрана 15.08.2026: колонка left_at в
  // боевой базе есть, а повторный запрос без неё пускал бы в кабинет уволенного
  // — молча, потому что без left_at проверка увольнения всегда «нет».
  const row = await supabase
    .from("users")
    .select("id, role, name, phone, email, photo_url, age, monthly_goal, left_at")
    .eq("auth_id", user.id)
    .maybeSingle();
  if (!row.data) return null;

  return { left_at: null, ...(row.data as object) } as AppUser;
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

  // Сравниваем не роль с разделом, а раздел со СВОИМ кабинетом: у разработчика
  // роль «dev», а кабинет — админский, и без этого его выбрасывало бы с
  // /admin/bookings на /admin при каждом входе.
  const home = ROLE_HOME[role];
  if (section && section in ROLE_HOME && `/${section}` !== home) return home;
  return next;
}

// Защита страницы кабинета: не залогинен → на /login (с возвратом обратно),
// чужая роль → в свой кабинет. Админ может заходить в любой кабинет.
export async function requireRole(role: AppRole, currentPath: string): Promise<AppUser> {
  const user = await getAppUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(currentPath)}`);
  // Уволенного не пускаем никуда, даже если кука ещё жива. Страница входа
  // покажет ему «доступ закрыт» и не станет редиректить обратно — иначе
  // получилась бы петля.
  if (isLeftStaff(user)) redirect("/login?closed=1");
  // Админ и разработчик (те же права) заходят в любой кабинет; админский —
  // родной для обоих.
  if (user.role !== role && !isAdminLike(user.role)) redirect(ROLE_HOME[user.role]);
  return user;
}
