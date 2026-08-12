import createIntlMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";

// Middleware делает две вещи:
// 1. next-intl: разбирает язык из URL и переписывает путь на сегмент [locale];
// 2. защита кабинетов: /admin, /instructor, /mechanic, /smm, /member, /agent доступны только
//    залогиненным пользователям с подходящей ролью (роль читается из JWT —
//    app_metadata.role, без запроса в базу). Админ может заходить в любой кабинет.
//
// Это первый рубеж (быстрый редирект). Второй — requireRole в layout'ах
// кабинетов, третий — RLS в самой базе. Даже если один слой обойти,
// данные защищают остальные.

const intlMiddleware = createIntlMiddleware(routing);

const PROTECTED = new Set(["admin", "instructor", "mechanic", "smm", "member", "agent"]);

// Убирает языковой префикс: '/en/instructor' → '/instructor', '/instructor' → как есть.
function stripLocale(pathname: string): string {
  const seg = pathname.split("/")[1];
  if ((routing.locales as readonly string[]).includes(seg)) {
    return pathname.slice(seg.length + 1) || "/";
  }
  return pathname;
}

export default async function middleware(request: NextRequest) {
  const response = intlMiddleware(request);

  // next-intl сам решил средиректить (смена языка и т.п.) — не вмешиваемся,
  // на следующем запросе middleware отработает снова.
  if (response.headers.has("location")) return response;

  const path = stripLocale(request.nextUrl.pathname);
  const section = path.split("/")[1];
  if (!PROTECTED.has(section)) return response;

  // Supabase-клиент, привязанный к кукам запроса. Обновлённые токены
  // записываем и в request (для страницы ниже), и в response (для браузера).
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", path);
    return NextResponse.redirect(loginUrl);
  }

  // Роль из JWT — быстрый кэш в токене. Она ОТСТАЁТ, если роль в таблице users
  // сменили уже после выдачи токена (инструктора повысили до admin — а токен
  // всё ещё instructor). Тогда middleware выгонял такого «админа» из /admin в
  // /instructor, хотя страницы и RLS (они смотрят в БД) пускают его как админа.
  let role = (user.app_metadata?.role as string | undefined) ?? "";

  // Сверяемся с БД (источник правды) ТОЛЬКО когда JWT собрался отказать: на
  // обычном входе (admin или совпадающая роль) запроса нет. users_select_own
  // отдаёт свою строку клиенту, привязанному к кукам запроса.
  if (role !== section && role !== "admin") {
    const { data } = await supabase
      .from("users")
      .select("role")
      .eq("auth_id", user.id)
      .maybeSingle();
    role = (data?.role as string | undefined) ?? role;
  }

  if (role !== section && role !== "admin") {
    // Чужой кабинет: отправляем в свой (или на логин, если роль не проставлена).
    const home = PROTECTED.has(role) ? `/${role}` : "/login";
    return NextResponse.redirect(new URL(home, request.url));
  }

  // Кабинеты открываются сразу на вкладке заявок — разделы живут в боковом
  // меню (layout → Sidebar). Мгновенный серверный редирект (без meta-refresh
  // от пререндера). Языковой префикс сохраняем (для en/vi он есть в pathname).
  const prefix = request.nextUrl.pathname.slice(
    0,
    request.nextUrl.pathname.length - path.length,
  );
  if (path === "/admin")
    return NextResponse.redirect(new URL(`${prefix}/admin/bookings`, request.url));
  if (path === "/instructor")
    return NextResponse.redirect(new URL(`${prefix}/instructor/bookings`, request.url));
  // У механика заявок нет — его рабочий экран календарь (кто на смене, какие
  // записи на день).
  if (path === "/mechanic")
    return NextResponse.redirect(new URL(`${prefix}/mechanic/calendar`, request.url));
  // СММщик начинает с заявок, как админ: его работа — поток людей с рекламы.
  if (path === "/smm")
    return NextResponse.redirect(new URL(`${prefix}/smm/bookings`, request.url));

  return response;
}

export const config = {
  // Прогоняем через middleware всё, кроме служебных путей Next и файлов с расширением.
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
