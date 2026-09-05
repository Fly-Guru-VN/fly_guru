"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Link, usePathname } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { useBooking } from "./BookingProvider";
import { NAV_LINKS } from "./nav";
import { IconClose, IconMenu } from "./icons";
import { SlidingHighlight } from "./SlidingHighlight";
import { useOptimisticPath } from "./useOptimisticPath";

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
  // Подсветка раздела едет за нажатием, а не за загрузкой страницы: иначе
  // плашка успевает моргнуть старым разделом (см. useOptimisticPath).
  const { path, goTo } = useOptimisticPath(pathname);

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
      // proxy.ts спокойно пускал (роль в токене совпала с разделом). Запрос
      // уходит только у залогиненных; RLS users_select_own отдаёт свою строку.
      const { data: row } = await supabase
        .from("users")
        .select("role")
        .eq("auth_id", session.user.id)
        .maybeSingle();
      if (cancelled) return;
      const role = row?.role as string | undefined;
      if (!role) return;
      // Разработчик работает в админском кабинете: раздела /dev нет (0044).
      const adminLike = role === "admin" || role === "dev";
      setCabinetHref(adminLike ? "/admin" : `/${role}`);

      if (role === "instructor" || adminLike) {
        // RLS (bookings_select_staff) пропустит только персонал.
        // Инструктору важны непринятые записи, админу — свежие заявки с сайта.
        let q = supabase
          .from("bookings")
          .select("id", { count: "exact", head: true });
        q = adminLike
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
  const isCurrent = (href: string) => path === href || path.startsWith(`${href}/`);

  // Пункты меню проявляются каскадом вслед за раскрытием — так это читается как
  // одно движение, а не как список, возникший разом. Задержка только на
  // открытии: закрывается меню целиком и сразу, ждать там нечего.
  // Каскад упирается в потолок на шестом пункте: иначе последние ждали бы
  // дольше, чем длится само раскрытие.
  const itemMotion = `transition-[opacity,transform,background-color,color] duration-200 motion-reduce:transition-none ${
    open ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"
  }`;
  const itemDelay = (i: number) => ({
    transitionDelay: open ? `${Math.min(i, 6) * 25}ms` : "0ms",
  });

  return (
    // Фирменный градиент «вода»: от бирюзы мелководья к глубине. Шапку просили
    // сделать заметной — на белом фоне страницы она сливалась, и на телефоне
    // человек не понимал, где верх интерфейса.
    //
    // Цвета одни и те же, но на телефоне градиент растянут ЗА край экрана:
    // тёмная точка стоит на 220% ширины. Иначе те же две точки укладывались в
    // 390 px, правый край добирался до самого тёмного тона, и шапка на телефоне
    // выглядела заметно мрачнее, чем на ПК (где переход размазан на 1400+ px и
    // почти незаметен — за это его и любим). С 768 px берём обычный градиент.
    <header className="sticky top-0 z-50 bg-[linear-gradient(90deg_in_oklab,var(--color-primary)_0%,var(--color-primary-strong)_220%)] text-white shadow-[0_2px_14px_rgba(11,110,127,0.28)] md:bg-gradient-to-r md:from-primary md:to-primary-strong">
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
        {/* Порог у меню НЕ md (768), а 960 px — единственное место, где шапка
            расходится с общей сеткой сайта, и менять его на md нельзя.
            Логотип, семь пунктов, «Вход» и «Записаться» требуют 869 px: на 768
            они не помещались, вылезали за край, и вбок уезжала ВСЯ страница —
            шапка sticky и тянет документ за собой. Ужимать пункты пришлось бы
            на сотню пикселей, это уже нечитаемый кегль, поэтому до порога
            работает бургер, как на телефоне.
            Именно 960, а не 870: на 900–920 меню встаёт вплотную к логотипу
            (замерено — зазор 0, плашка активного пункта наезжает на «FlyGuru»),
            а с 960 между ними появляется воздух. */}
        <nav className="hidden items-center gap-1 min-[960px]:flex">
          <SlidingHighlight
            activeKey={NAV_LINKS.find((l) => isCurrent(l.href))?.href ?? null}
            pillClassName="bg-white/20"
            followHover
            className="flex items-center gap-1"
          >
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => goTo(l.href)}
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
            onClick={() => openBooking({ place: "header" })}
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
          aria-controls="mobile-menu"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-white transition-colors hover:bg-white/25 active:scale-95 min-[960px]:hidden"
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
          текущий раздел залит белым. Фон — основной бирюзовый, тот же, что у
          светлой части шапки: тёмная заливка ниже осветлённой шапки читалась
          как ступенька.

          Меню РАСКАТЫВАЕТСЯ, а не возникает. Раньше оно появлялось сразу во всю
          высоту и лишь подтягивалось на 8 px (animate-menu-down) — глаз читал
          это как рывок, а закрытие не анимировалось вовсе (David, 04.09.2026:
          «выпадает недостаточно плавно»).

          Высоту тянем через grid-template-rows 0fr → 1fr: это единственный
          способ доехать до НАСТОЯЩЕЙ высоты содержимого, не подставляя руками
          max-height наугад (промахнёшься вниз — меню обрежется, вверх — конец
          раскрытия идёт по пустоте). Обёртка при этом остаётся в потоке, и
          шапка раздвигается вместе с ней, как и раньше.

          inert на закрытом меню обязателен: оно никуда не делось из разметки, и
          без него Tab заводил бы в невидимые ссылки.

          Одной нулевой высоты мало: пункты внутри сохраняют свои коробки, их
          просто обрезает overflow. Для всего, что судит по коробке (в том числе
          для наших же e2e), свёрнутое меню оставалось кликабельным. Поэтому
          закрытому меню отдельно ставится visibility: hidden — в переходе это
          свойство ступенчатое, так что на закрытии оно дожидается конца
          сворачивания, а на открытии срабатывает сразу. */}
      <div
        id="mobile-menu"
        inert={!open}
        className={`grid overflow-hidden transition-[grid-template-rows,visibility] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none min-[960px]:hidden ${
          open ? "visible grid-rows-[1fr]" : "invisible grid-rows-[0fr]"
        }`}
      >
        {/* Рамку рисуем только у раскрытого меню. У свёрнутого высота строки
            нулевая, но собственная рамка нижним краем всё равно даёт
            светлую ниточку под шапкой во всю ширину экрана (замерено: 1 px). */}
        <nav
          className={`min-h-0 bg-primary ${open ? "border-t border-white/15" : ""}`}
        >
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-3 sm:px-6">
            {NAV_LINKS.map((l, i) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => {
                  setOpen(false);
                  goTo(l.href);
                }}
                aria-current={isCurrent(l.href) ? "page" : undefined}
                style={itemDelay(i)}
                className={`${itemMotion} flex items-center justify-between gap-2 rounded-xl px-4 py-3 font-semibold ${
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
              style={itemDelay(NAV_LINKS.length)}
              className={`${itemMotion} mt-2 flex items-center justify-between rounded-xl border border-white/40 px-4 py-3 font-semibold text-white hover:bg-white/15`}
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
                openBooking({ place: "burger" });
              }}
              style={itemDelay(NAV_LINKS.length + 1)}
              className={`${itemMotion} mt-1 mb-1 rounded-full bg-accent px-5 py-3 text-center font-semibold text-white hover:bg-accent-strong active:scale-95`}
            >
              Записаться
            </button>
          </div>
        </nav>
      </div>
    </header>
  );
}
