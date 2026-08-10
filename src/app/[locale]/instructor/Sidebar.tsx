"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Link, usePathname } from "@/i18n/navigation";
import { LinkSpinner } from "@/components/Spinner";
import { SlidingHighlight } from "@/components/SlidingHighlight";
import {
  INSTRUCTOR_UPDATES_SEEN_KEY,
  useUpdatesSeen,
} from "@/components/cabinet/useUpdatesSeen";
import { logoutAction } from "../login/actions";

// Боковое меню кабинета инструктора. На ПК — узкая колонка слева (sticky).
// На телефоне — фиксированная нижняя панель с 4 главными разделами + «Ещё»
// (лист со всеми остальными). Активный блок подсвечивается (usePathname).
//
// primary — раздел выносится в нижнюю панель на телефоне; short — короткая
// подпись для узкой ячейки этой панели.

type NavItem = {
  href: string;
  label: string;
  short?: string;
  hint?: string;
  primary?: boolean;
  badge?: number;
  dot?: boolean; // красная точка «есть новое» — без числа
};

const UPDATES_HREF = "/instructor/updates";

// Разделы группами — как в админке (10.08.2026). Тринадцать пунктов подряд с
// подписью под каждым читались как сплошная серая простыня, по которой глаз
// каждый раз искал нужное заново. Группы дают опору, а подписи после этого
// стали лишними: название группы уже говорит, зачем сюда идут.
//
// «Сегодня» — первым: сводка дня (ЗП, выручка, 35% Марине, касса) нужна
// каждый день и по несколько раз. Пятую вкладку в нижнюю панель телефона не
// ставим: подписи там и так 11 пикселей.
const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Каждый день",
    items: [
      { href: "/instructor/today", label: "Сегодня", hint: "ЗП · выручка · марина", primary: true },
      { href: "/instructor/bookings", label: "Записи", hint: "от админа", primary: true },
      { href: "/instructor/record", label: "Записать клиента", short: "Записать", hint: "новая сессия", primary: true },
      { href: "/instructor/shift", label: "Смена", hint: "открыть · закрыть · фото", primary: true },
    ],
  },
  {
    title: "Работа",
    items: [
      { href: "/instructor/sessions", label: "Сессии", hint: "мои записи · правка" },
      { href: "/instructor/clients", label: "Клиенты", hint: "база · поиск" },
      { href: "/instructor/calendar", label: "Календарь", hint: "смены · записи" },
      { href: "/instructor/subscription", label: "Абонемент", hint: "продажа" },
      { href: "/instructor/writeoff", label: "Списание", hint: "минуты" },
    ],
  },
  {
    title: "Деньги",
    items: [
      { href: "/instructor/stats", label: "Статистика", hint: "за любой период" },
      { href: "/instructor/expenses", label: "Расходы", hint: "свои траты" },
    ],
  },
  {
    title: "Система",
    items: [
      { href: UPDATES_HREF, label: "Обновления", hint: "что нового в кабинете" },
      { href: "/instructor/settings", label: "Настройки", hint: "имя · фото · цель" },
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

// Нижняя панель телефона. Инструктор смотрит в неё на пляже, под прямым
// солнцем, — раньше активная вкладка отличалась только цветом подписи
// (бирюзовая вместо серой) в 11 пикселей, и на выгоревшем экране разницы
// не было видно. Теперь активная вкладка — залитая плашка с белым текстом,
// как в меню на ПК: пятно цвета читается даже боковым зрением. Неактивные
// подписи стали основным тёмным текстом вместо серого — по той же причине.
const mobileBarClass =
  "fixed inset-x-0 bottom-0 z-30 flex gap-1 border-t border-line bg-surface px-1 pt-1 pb-[calc(0.25rem+env(safe-area-inset-bottom))] shadow-[0_-2px_12px_rgba(15,34,51,0.10)]";
const mobileTabClass =
  "relative flex flex-1 items-center justify-center rounded-xl px-1 py-2.5 text-[11px] font-bold leading-tight transition-colors duration-150 active:scale-95";
// Заливку активной вкладки рисует не она сама, а плашка, которая переезжает
// между вкладками (SlidingHighlight) — поэтому здесь остался только цвет
// текста поверх этой плашки.
// delay: белым подпись становится не сразу, а когда плашка доехала. Иначе
// на треть секунды получалось белое по белому — вкладка «пропадала».
const mobileTabActive = "text-white delay-150";
const mobileTabIdle = "text-ink";

export function Sidebar({
  name,
  photoUrl,
  amountLabel,
  amountSub,
  activeCount,
}: {
  name: string;
  photoUrl: string | null;
  amountLabel: string;
  amountSub: string;
  activeCount: number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Красная точка «есть новое» — общая механика с админкой (localStorage,
  // свой ключ у каждого кабинета).
  const { hasNew: hasNewUpdates, markSeen } = useUpdatesSeen(
    INSTRUCTOR_UPDATES_SEEN_KEY,
  );
  // Зашёл на вкладку — считаем ленту прочитанной. Пишем в эффекте (это запись
  // наружу, не состояние React), точка гаснет по событию из markSeen.
  useEffect(() => {
    if (pathname.startsWith(UPDATES_HREF)) markSeen();
  }, [pathname, markSeen]);

  const withBadges = NAV.map((item) => {
    if (item.href === "/instructor/bookings") {
      return { ...item, badge: activeCount };
    }
    if (item.href === UPDATES_HREF) return { ...item, dot: hasNewUpdates };
    return item;
  });
  const active =
    withBadges.find((item) => pathname.startsWith(item.href)) ?? withBadges[0];
  // Нижняя панель телефона: главные разделы + «Ещё». «Ещё» подсвечиваем, когда
  // открыт раздел не из панели (или лист развёрнут).
  const primaryItems = withBadges.filter((item) => item.primary);
  const moreActive = !primaryItems.some((item) => pathname.startsWith(item.href));

  // Карточка профиля. На ПК она — шапка панели меню (рамку и фон даёт сама
  // панель, здесь остаётся только линия-отбивка), в мобильном листе —
  // отдельная карточка, как была.
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
        <p className="truncate text-lg font-bold text-primary">{amountLabel}</p>
        <p className="truncate text-xs text-muted">{amountSub}</p>
      </div>
    </div>
  );

  // Один пункт меню. Подписи (hint) не показываем нигде: на ПК про раздел уже
  // сказала группа, а на телефоне это был именно тот «лишний текст», из-за
  // которого лист «Ещё» приходилось прокручивать.
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

  const byHref = new Map(withBadges.map((item) => [item.href, item]));

  // Разделы группами. Заголовок группы — подпись полки, а не пункт меню:
  // мелкий капс, приглушённый цвет и линия до правого края. Линия и есть
  // сигнал «сюда не нажимают» — у настоящих пунктов её нет.
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
      {/* ПК: меню — отдельная панель-карточка на всю высоту со своим скроллом
          (не уезжает с контентом). Раньше пункты лежали прямо на фоне страницы
          и сливались с содержимым раздела. Высота — минус my-6, чтобы панель
          стояла вровень с колонкой контента. */}
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
            // Есть свободные записи, а инструктор не на этой вкладке — красим
            // всю вкладку, а не только уголок. Кружок в 16 пикселей на пляже
            // под солнцем не замечали, и записи висели непринятыми.
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
            {/* «Обновления» лежат внутри этого листа — без точки на самой
                кнопке инструктор с телефона про них не узнает. */}
            {hasNewUpdates && !open ? (
              <span
                aria-label="есть новое"
                className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-surface"
              />
            ) : null}
          </button>
          </SlidingHighlight>
        </nav>
      </div>
    </aside>
  );
}
