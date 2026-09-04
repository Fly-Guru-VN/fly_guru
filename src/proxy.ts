import createIntlMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";

// Proxy делает две вещи:
// 1. next-intl: разбирает язык из URL и переписывает путь на сегмент [locale];
// 2. защита кабинетов: /admin, /instructor, /mechanic, /smm, /agent доступны только
//    залогиненным пользователям с подходящей ролью (роль читается из JWT —
//    app_metadata.role, без запроса в базу). Админ может заходить в любой кабинет.
//
// Это первый рубеж (быстрый редирект). Второй — requireRole в layout'ах
// кабинетов, третий — RLS в самой базе. Даже если один слой обойти,
// данные защищают остальные.

const intlMiddleware = createIntlMiddleware(routing);

// /member здесь намеренно НЕТ. Это кабинет клиента, и входит он не через
// Supabase-логин, а через Telegram: страницу открывает мини-приложение бота,
// личность проверяет серверное действие по подписи Telegram (lib/tgAuth).
// Оставь /member в этом списке — и каждого клиента proxy уводил бы на
// страницу входа, где ему нечего вводить: пароля у него нет и не будет.
const PROTECTED = new Set(["admin", "instructor", "mechanic", "smm", "agent"]);

// Разработчик (0044) — тот же админ по правам, и кабинет у него админский:
// раздела /dev не существует, он ходит в /admin. Поэтому везде, где раньше
// стояло «роль admin», теперь спрашиваем этот признак.
const adminLike = (role: string) => role === "admin" || role === "dev";

// Убирает языковой префикс: '/en/instructor' → '/instructor', '/instructor' → как есть.
function stripLocale(pathname: string): string {
  const seg = pathname.split("/")[1];
  if ((routing.locales as readonly string[]).includes(seg)) {
    return pathname.slice(seg.length + 1) || "/";
  }
  return pathname;
}

export async function proxy(request: NextRequest) {
  // Next 16.3 повторно вызывает proxy после внутреннего rewrite next-intl
  // (/training → /ru/training). Повторно запускать intlMiddleware нельзя: он
  // канонизирует /ru/training обратно в /training, и получается вечный 307.
  // Служебный заголовок ставит сам next-intl на переписанном запросе.
  // ВАЖНО: ниже всё равно выполняются проверки auth/ролей — заголовок не даёт
  // возможности обойти защиту кабинетов, даже если клиент подделает его.
  const response = request.headers.has("x-next-intl-locale")
    ? NextResponse.next()
    : intlMiddleware(request);

  // next-intl сам решил средиректить (смена языка и т.п.) — не вмешиваемся,
  // на следующем запросе proxy отработает снова.
  if (response.headers.has("location")) return response;

  const path = stripLocale(request.nextUrl.pathname);
  const section = path.split("/")[1];

  // Telegram Web открывает Mini App в iframe. Общий заголовок из next.config
  // запрещает framing всего сайта; исключение ставим именно на ФИНАЛЬНЫЙ
  // ответ next-intl, иначе locale middleware перезапишет config override.
  // Другим origin и всем остальным страницам встраивание по-прежнему закрыто.
  if (section === "member") {
    response.headers.set(
      "Content-Security-Policy",
      "frame-ancestors 'self' https://web.telegram.org",
    );
    response.headers.delete("X-Frame-Options");
    return response;
  }

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
  // всё ещё instructor). Тогда proxy выгонял такого «админа» из /admin в
  // /instructor, хотя страницы и RLS (они смотрят в БД) пускают его как админа.
  let role = (user.app_metadata?.role as string | undefined) ?? "";

  // Сверяемся с БД (источник правды) ТОЛЬКО когда JWT собрался отказать: на
  // обычном входе (admin или совпадающая роль) запроса нет. users_select_own
  // отдаёт свою строку клиенту, привязанному к кукам запроса.
  if (role !== section && !adminLike(role)) {
    const { data } = await supabase
      .from("users")
      .select("role")
      .eq("auth_id", user.id)
      .maybeSingle();
    role = (data?.role as string | undefined) ?? role;
  }

  if (role !== section && !adminLike(role)) {
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
  // Прогоняем через proxy всё, кроме служебных путей Next и файлов с расширением.
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
