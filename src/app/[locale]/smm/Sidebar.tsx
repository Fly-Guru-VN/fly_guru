"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Link, usePathname } from "@/i18n/navigation";
import { LinkSpinner } from "@/components/Spinner";
import { SlidingHighlight } from "@/components/SlidingHighlight";
import { SMM_UPDATES_SEEN_KEY, useUpdatesSeen } from "@/components/cabinet/useUpdatesSeen";
import { logoutAction } from "../login/actions";

// Боковое меню кабинета СММщика — тот же компонент, что в админке и у
// инструктора (на ПК панель-карточка, на телефоне нижняя панель + лист «Ещё»).
//
// Отличий от админского два: разделов тринадцать вместо шестнадцати (нет
// календаря, расчёта выплат, членов клуба и услуг — это не его работа, зато
// есть своя «Моя ЗП») и в профиле нет чистой прибыли: деньги школы он видит
// только как выручку, во вкладке «Статистика».

type NavItem = {
  href: string;
  label: string;
  short?: string;
  primary?: boolean;
  badge?: number;
  dot?: boolean; // красная точка «есть новое» — без числа
};

const UPDATES_HREF = "/smm/updates";

// Порядок групп — по частоте, как в админке: сначала то, что открывают каждый
// день. «Реклама» стоит выше, чем у админа: для СММщика это рабочий стол, а не
// справка.
const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Каждый день",
    items: [
      { href: "/smm/bookings", label: "Заявки", primary: true },
      { href: "/smm/record", label: "Записать клиента", short: "Записать", primary: true },
      { href: "/smm/sessions", label: "Сессии" },
    ],
  },
  {
    title: "Реклама",
    items: [
      { href: "/smm/materials", label: "Материалы", primary: true },
      { href: "/smm/sources", label: "Источники", primary: true },
    ],
  },
  {
    title: "Люди",
    items: [
      { href: "/smm/clients", label: "Клиенты" },
      { href: "/smm/subscriptions", label: "Абонементы" },
      { href: "/smm/agents", label: "Агенты" },
    ],
  },
  {
    title: "Деньги",
    items: [
      { href: "/smm/dashboard", label: "Статистика" },
      { href: "/smm/salary", label: "Моя ЗП" },
      { href: "/smm/expenses", label: "Расходы" },
    ],
  },
  {
    title: "Система",
    items: [
      { href: UPDATES_HREF, label: "Обновления" },
      { href: "/smm/settings", label: "Настройки" },
    ],
  },
];

const NAV: NavItem[] = GROUPS.flatMap((g) => g.items);

function CountBubble({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
      {count}
    </span>
  );
}

// Классы нижней панели — общие с остальными кабинетами, менять их надо разом.
const mobileBarClass =
  "fixed inset-x-0 bottom-0 z-30 flex gap-1 border-t border-line bg-surface px-1 pt-1 pb-[calc(0.25rem+env(safe-area-inset-bottom))] shadow-[0_-2px_12px_rgba(15,34,51,0.10)]";
const mobileTabClass =
  "relative flex flex-1 items-center justify-center rounded-xl px-1 py-2.5 text-[11px] font-bold leading-tight transition-colors duration-150 active:scale-95";
const mobileTabActive = "text-white delay-150";
const mobileTabIdle = "text-ink";

export function Sidebar({
  name,
  photoUrl,
  freshCount,
}: {
  name: string;
  photoUrl: string | null;
  freshCount: number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Ключ хранилища свой: прочитанное в кабинете СММщика не должно гасить точку
  // админу, который зашёл с того же браузера.
  const { hasNew: hasNewUpdates, markSeen } = useUpdatesSeen(SMM_UPDATES_SEEN_KEY);
  useEffect(() => {
    if (pathname.startsWith(UPDATES_HREF)) markSeen();
  }, [pathname, markSeen]);

  const withBadges = NAV.map((item) => {
    if (item.href === "/smm/bookings") return { ...item, badge: freshCount };
    if (item.href === UPDATES_HREF) return { ...item, dot: hasNewUpdates };
    return item;
  });
  const active =
    withBadges.find((item) => pathname.startsWith(item.href)) ?? withBadges[0];
  const primaryItems = withBadges.filter((item) => item.primary);
  const moreActive = !primaryItems.some((item) => pathname.startsWith(item.href));
  const byHref = new Map(withBadges.map((item) => [item.href, item]));

  const profileBlock = (className: string) => (
    <div className={`flex shrink-0 items-center gap-3 p-4 ${className}`}>
      {photoUrl ? (
        <Image
          src={photoUrl}
          alt={name}
          width={48}
          height={48}
          className="h-12 w-12 shrink-0 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
          {name.trim().charAt(0).toUpperCase() || "?"}
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-bold">{name}</p>
        <p className="truncate text-xs text-muted">СММ</p>
      </div>
    </div>
  );

  const navLink = (item: NavItem, big: boolean) => {
    const isActive = item.href === active.href;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setOpen(false)}
        aria-current={isActive ? "page" : undefined}
        className={`flex items-center justify-between gap-2 rounded-xl px-3 text-sm font-semibold transition-colors ${
          big ? "py-3" : "py-2"
        } ${isActive ? "bg-primary text-white" : "text-foreground hover:bg-line/50"}`}
      >
        <span className="min-w-0 truncate">{item.label}</span>
        <LinkSpinner />
        {item.badge ? <CountBubble count={item.badge} /> : null}
        {item.dot ? (
          <span
            aria-label="есть новое"
            className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500"
          />
        ) : null}
      </Link>
    );
  };

  const logout = (
    <form action={logoutAction} className="mt-1">
      <button
        type="submit"
        className="w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-muted transition-colors hover:bg-line/50"
      >
        Выход
      </button>
    </form>
  );

  // Заголовок группы — подпись полки, а не пункт меню: мелкий капс и линия до
  // правого края (у кликабельных пунктов её нет).
  const groupedLinks = (big: boolean) => (
    <nav className="flex flex-col gap-3">
      {GROUPS.map((group) => (
        <div key={group.title}>
          <div className="flex select-none items-center gap-2 px-3 pb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted/80">
              {group.title}
            </span>
            <span aria-hidden className="h-px flex-1 bg-line" />
          </div>
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => navLink(byHref.get(item.href) ?? item, big))}
          </div>
        </div>
      ))}
      {logout}
    </nav>
  );

  return (
    <aside className="md:h-full md:w-64 md:shrink-0">
      {/* ПК: меню — отдельная панель-карточка на всю высоту со своим скроллом. */}
      <div className="hidden md:my-6 md:flex md:h-[calc(100%-3rem)] md:flex-col md:overflow-hidden md:rounded-2xl md:border md:border-line md:bg-surface md:shadow-[0_1px_3px_rgba(15,34,51,0.04)]">
        {profileBlock("border-b border-line/70")}
        <div className="scroll-soft min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
          {groupedLinks(false)}
        </div>
      </div>

      {/* Телефон: фиксированная нижняя панель + выезжающий лист «Ещё» */}
      <div className="md:hidden">
        {open && (
          <>
            <button
              type="button"
              aria-label="Закрыть меню"
              onClick={() => setOpen(false)}
              className="animate-fade-in fixed inset-0 z-40 bg-black/40"
            />
            <div className="animate-sheet-up fixed inset-x-0 bottom-0 z-50 max-h-[80dvh] space-y-3 overflow-y-auto rounded-t-2xl border-t border-line bg-bg p-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
              {profileBlock("rounded-2xl border border-line bg-surface")}
              {groupedLinks(true)}
            </div>
          </>
        )}

        <nav className={mobileBarClass}>
          <SlidingHighlight
            activeKey={
              moreActive || open
                ? "more"
                : (primaryItems.find((item) => pathname.startsWith(item.href))
                    ?.href ?? null)
            }
            pillClassName="rounded-xl bg-primary shadow-sm"
            className="flex flex-1 gap-1"
          >
            {primaryItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              // Есть новые заявки, а человек не на этой вкладке — красим
              // вкладку целиком (то же, что у админа и инструктора).
              const alerting = Boolean(item.badge) && !isActive;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  data-tab={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`${mobileTabClass} ${
                    isActive
                      ? mobileTabActive
                      : alerting
                        ? "bg-red-500/10 text-red-600"
                        : mobileTabIdle
                  }`}
                >
                  <span className="max-w-full truncate">{item.short ?? item.label}</span>
                  {item.badge ? (
                    <span className="absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white ring-2 ring-surface">
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              data-tab="more"
              className={`${mobileTabClass} flex-col gap-0.5 ${
                moreActive || open ? mobileTabActive : mobileTabIdle
              }`}
            >
              <span aria-hidden className="text-base leading-none">
                ☰
              </span>
              Ещё
            </button>
          </SlidingHighlight>
        </nav>
      </div>
    </aside>
  );
}
