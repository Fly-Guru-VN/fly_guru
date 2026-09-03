"use client";

import { usePathname } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { useBooking } from "./BookingProvider";
import { MOBILE_TABS, NO_TAB_BAR_PREFIXES } from "./nav";
import { SlidingHighlight } from "./SlidingHighlight";
import {
  IconCalendarPlus,
  IconClub,
  IconFoil,
  IconTag,
  IconTandem,
} from "./icons";

// Нижняя панель разделов на телефоне (идея David, 28.08.2026).
//
// Зачем: на телефоне единственным ориентиром была шапка с бургером — человек
// не понимал, в каком разделе стоит, и за каждым следующим лез в меню в два
// тапа. Панель внизу отвечает на оба вопроса сразу: где я (залитая плашка) и
// куда ещё можно (иконки под большим пальцем). Разделы этой же четвёркой
// листаются свайпом, см. SwipeNav.
//
// Панель рисуется поверх подвала, поэтому в layout у main есть нижнее поле на
// её высоту — иначе контакты в подвале оказывались под ней.

// Иконки лежат здесь, а не в nav.ts: тот файл читает и сервер (шапка, подвал),
// а тащить в него JSX незачем.
const ICONS = {
  foil: IconFoil,
  tandem: IconTandem,
  club: IconClub,
  tag: IconTag,
} as const;

// Те же классы, что у нижней панели кабинетов: одинаковая панель в двух местах
// сайта должна и выглядеть одинаково. Активная вкладка — залитая плашка с
// белым текстом (цветное пятно видно боковым зрением и на солнце), неактивные
// подписи — основным тёмным, а не серым.
const tabClass =
  "relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[11px] font-bold leading-tight transition-colors duration-150 active:scale-95";
// delay: подпись белеет, когда плашка доехала. Иначе треть секунды белое по
// белому — вкладка «пропадает» (те же грабли, что в кабинете).
const tabActive = "text-white delay-150";
const tabIdle = "text-ink";

export function MobileTabBar() {
  const pathname = usePathname();
  const { open: openBooking } = useBooking();

  // В кабинетах и на экранах входа панели нет.
  if (
    NO_TAB_BAR_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    )
  )
    return null;

  const active =
    MOBILE_TABS.find(
      (t) => pathname === t.href || pathname.startsWith(`${t.href}/`),
    ) ?? null;

  return (
    <>
      {/* Место под панель в конце документа: сама панель «висит» над страницей
          и без этой подпорки накрывала бы контакты в подвале. Живёт здесь, а не
          в layout, чтобы в кабинетах (где компонент вернул null) не оставалось
          пустой полосы под их собственной панелью. */}
      <div
        aria-hidden
        className="h-[calc(3.75rem+env(safe-area-inset-bottom))] md:hidden"
      />
      <nav
        aria-label="Разделы сайта"
        className="fixed inset-x-0 bottom-0 z-40 flex gap-1 border-t border-line bg-surface px-1 pt-1 pb-[calc(0.25rem+env(safe-area-inset-bottom))] shadow-[0_-2px_12px_rgba(15,34,51,0.10)] md:hidden"
      >
        <SlidingHighlight
          activeKey={active?.href ?? null}
          pillClassName="bg-primary"
          pillRadius="0.75rem"
          pillShadow="0 1px 2px rgb(0 0 0 / 0.05)"
          className="flex flex-1 gap-1"
        >
          {MOBILE_TABS.map((tab) => {
            const Icon = ICONS[tab.icon];
            const isActive = tab.href === active?.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                data-tab={tab.href}
                aria-current={isActive ? "page" : undefined}
                className={`${tabClass} ${isActive ? tabActive : tabIdle}`}
              >
                <Icon aria-hidden className="h-5 w-5" />
                <span className="max-w-full truncate">{tab.label}</span>
              </Link>
            );
          })}
        </SlidingHighlight>

        {/* Запись — не раздел, поэтому стоит отдельной кнопкой за пределами ряда
          вкладок: плашка активного раздела на неё не переезжает, а оранжевый
          квадрат виден на панели первым. Это же та кнопка, что раньше висела
          над экраном отдельной полосой (StickyBookBar) — теперь она на месте
          всегда, а не только после прокрутки первого экрана. */}
        <button
          type="button"
          onClick={() => openBooking({ place: "tabbar" })}
          aria-label="Записаться"
          className="flex w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl bg-accent px-1 py-1.5 text-[11px] font-bold leading-tight text-white transition-[background-color,transform] duration-150 hover:bg-accent-strong active:scale-95"
        >
          <IconCalendarPlus aria-hidden className="h-5 w-5" />
          Запись
        </button>
      </nav>
    </>
  );
}
