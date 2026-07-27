"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { useBooking } from "./BookingProvider";
import { NAV_LINKS } from "./nav";
import { IconClose, IconMenu } from "./icons";
import { SlidingHighlight } from "./SlidingHighlight";

// Шапка сайта. Клиентский компонент ради мобильного меню и кнопки «Вход/Кабинет».
//
// Публичные страницы статические (SSG) — сервер не знает, кто залогинен.
// Поэтому сессию проверяем в браузере после загрузки: supabase читает её из
// куки локально, без похода в сеть. До проверки показываем «Вход» — у гостей
// (99% посетителей) ничего не мигает.
export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const { open: openBooking } = useBooking();
  // Куда ведёт кнопка кабинета: null = не залогинен (показываем «Вход»).
  const [cabinetHref, setCabinetHref] = useState<string | null>(null);
  // Активные записи (подтверждены админом, никем не приняты) — красный
  // кружочек на кнопке «Кабинет» у инструктора и админа.
  const [activeCount, setActiveCount] = useState(0);
  const pathname = usePathname();

  // Пересчёт при каждой смене страницы и при возврате во вкладку — раньше
  // цифра считалась один раз при загрузке и «застревала».
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const refresh = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled || !session) return;

      // Роль спрашиваем у базы, а НЕ у JWT (app_metadata.role). Токен в браузере
      // отстаёт: у повышенного до admin инструктора он до ближайшего обновления
      // всё ещё говорит «instructor» — и кнопка вела в чужой кабинет, куда
      // middleware спокойно пускал (роль в токене совпала с разделом). Запрос
      // уходит только у залогиненных; RLS users_select_own отдаёт свою строку.
      const { data: row } = await supabase
        .from("users")
        .select("role")
        .eq("auth_id", session.user.id)
        .maybeSingle();
      if (cancelled) return;
      const role = row?.role as string | undefined;
      if (!role) return;
      setCabinetHref(`/${role}`); // /admin, /instructor, /member, /agent

      if (role === "instructor" || role === "admin") {
        // RLS (bookings_select_staff) пропустит только персонал.
        // Инструктору важны непринятые записи, админу — свежие заявки с сайта.
        let q = supabase
          .from("bookings")
          .select("id", { count: "exact", head: true });
        q =
          role === "admin"
            ? q.eq("status", "new")
            : q.eq("status", "confirmed").is("accepted_by", null);
        const { count } = await q;
        if (!cancelled) setActiveCount(count ?? 0);
      }
    };

    void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname]);

  const authHref = cabinetHref ?? "/login";
  const authLabel = cabinetHref ? "Кабинет" : "Вход";

  const countBubble = activeCount > 0 && (
    <span className="absolute -right-1.5 -top-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white ring-2 ring-primary-strong">
      {activeCount}
    </span>
  );

  // Текущий раздел. pathname приходит уже без префикса локали (useI18n-навигация),
  // поэтому сравниваем напрямую. Раньше активный пункт не выделялся вообще —
  // на цветной шапке это стало заметно сразу.
  const isCurrent = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    // Фирменный градиент «вода»: от бирюзы мелководья к глубине. Шапку просили
    // сделать заметной — на белом фоне страницы она сливалась, и на телефоне
    // человек не понимал, где верх интерфейса.
    <header className="sticky top-0 z-50 bg-gradient-to-r from-primary to-primary-strong text-white shadow-[0_2px_14px_rgba(11,110,127,0.28)]">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-bold" onClick={() => setOpen(false)}>
          <Image
            src="/brand/flyguru-logo.jpg"
            alt="FlyGuru"
            width={36}
            height={36}
            className="rounded-full ring-2 ring-white/70"
            priority
          />
          <span className="text-lg">FlyGuru</span>
        </Link>

        {/* Десктоп-навигация. Подсветка раздела — не фон у ссылки, а отдельная
            плашка, которая переезжает между вкладками (SlidingHighlight) и
            подтягивается к той, на которую навели.
            Кружка загрузки у пунктов нет намеренно: он раздвигал ширину пункта,
            плашка под ним дёргалась, а страницы сайта и так открываются сразу. */}
        <nav className="hidden items-center gap-1 md:flex">
          <SlidingHighlight
            activeKey={NAV_LINKS.find((l) => isCurrent(l.href))?.href ?? null}
            pillClassName="rounded-full bg-white/20"
            followHover
            className="flex items-center gap-1"
          >
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                data-tab={l.href}
                aria-current={isCurrent(l.href) ? "page" : undefined}
                className={`relative flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold transition-colors ${
                  isCurrent(l.href) ? "text-white" : "text-white/80 hover:text-white"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </SlidingHighlight>
          <Link
            href={authHref}
            className="relative ml-2 rounded-full border border-white/40 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/15"
          >
            {authLabel}
            {countBubble}
          </Link>
          <button
            type="button"
            onClick={() => openBooking()}
            className="ml-1 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-[background-color,transform] duration-150 hover:bg-accent-strong active:scale-95"
          >
            Записаться
          </button>
        </nav>

        {/* Кнопка мобильного меню */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Меню"
          aria-expanded={open}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-white transition-colors hover:bg-white/25 active:scale-95 md:hidden"
        >
          {/* Обе иконки лежат друг на друге в квадрате 24×24 по центру кнопки и
              переключаются прозрачностью с доворотом: палец видит, что нажатие
              сработало, даже если меню ещё не доехало. Значок при этом стоит на
              месте — раньше символы «☰»/«✕» из шрифта были разной ширины и
              смещали центр. */}
          <span className="relative block h-6 w-6">
            <IconMenu
              className={`absolute inset-0 h-6 w-6 transition-[opacity,transform] duration-200 ${
                open ? "rotate-90 opacity-0" : "rotate-0 opacity-100"
              }`}
            />
            <IconClose
              className={`absolute inset-0 h-6 w-6 transition-[opacity,transform] duration-200 ${
                open ? "rotate-0 opacity-100" : "-rotate-90 opacity-0"
              }`}
            />
          </span>
        </button>
      </div>

      {/* Мобильное меню: продолжение шапки, а не белая простыня под ней.
          Пункты — крупные пилюли с отступами (линии-разделители убраны),
          текущий раздел залит белым. */}
      {open && (
        <nav className="animate-menu-down border-t border-white/15 bg-primary-strong md:hidden">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-3 sm:px-6">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                aria-current={isCurrent(l.href) ? "page" : undefined}
                className={`flex items-center justify-between gap-2 rounded-xl px-4 py-3 font-semibold transition-colors ${
                  isCurrent(l.href)
                    ? "bg-white text-primary-strong"
                    : "text-white/85 hover:bg-white/10 hover:text-white"
                }`}
              >
                {l.label}
              </Link>
            ))}
            <Link
              href={authHref}
              onClick={() => setOpen(false)}
              className="mt-2 flex items-center justify-between rounded-xl border border-white/40 px-4 py-3 font-semibold text-white transition-colors hover:bg-white/15"
            >
              {cabinetHref ? "Мой кабинет" : "Вход в кабинет"}
              {activeCount > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
                  {activeCount}
                </span>
              )}
            </Link>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                openBooking();
              }}
              className="mt-1 mb-1 rounded-full bg-accent px-5 py-3 text-center font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-accent-strong active:scale-95"
            >
              Записаться
            </button>
          </div>
        </nav>
      )}
    </header>
  );
}
