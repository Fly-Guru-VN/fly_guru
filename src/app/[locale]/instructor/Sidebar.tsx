"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { Link, usePathname } from "@/i18n/navigation";
import { LATEST_UPDATE } from "@/content/updates";
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

// Дату последней прочитанной записи «Обновлений» держим в самом браузере:
// заводить ради этого колонку в базе не за что, а телефон у инструктора свой.
const UPDATES_SEEN_KEY = "flyguru:updates-seen";
const UPDATES_SEEN_EVENT = "flyguru:updates-seen-changed";
const UPDATES_HREF = "/instructor/updates";

// Собственное событие: `storage` браузер шлёт только ДРУГИМ вкладкам, а точку
// надо погасить в этой же.
function subscribeUpdatesSeen(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(UPDATES_SEEN_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(UPDATES_SEEN_EVENT, onChange);
  };
}

// Приватный режим Safari умеет бросаться на localStorage — молча считаем, что
// человек ничего не читал, вместо белого экрана кабинета.
function readUpdatesSeen(): string {
  try {
    return localStorage.getItem(UPDATES_SEEN_KEY) ?? "";
  } catch {
    return "";
  }
}

function markUpdatesSeen() {
  try {
    if (localStorage.getItem(UPDATES_SEEN_KEY) === LATEST_UPDATE) return;
    localStorage.setItem(UPDATES_SEEN_KEY, LATEST_UPDATE);
    window.dispatchEvent(new Event(UPDATES_SEEN_EVENT));
  } catch {
    // приватный режим — точка просто останется гореть
  }
}

const NAV: NavItem[] = [
  { href: "/instructor/bookings", label: "Записи", hint: "от админа", primary: true },
  { href: "/instructor/record", label: "Записать клиента", short: "Записать", hint: "новая сессия", primary: true },
  { href: "/instructor/shift", label: "Смена", hint: "открыть · закрыть · фото", primary: true },
  // «Сессии» — в нижнюю панель телефона вместо «Списания»: проверять, что
  // запись действительно ушла в базу, инструктор будет каждый день, а списание
  // минут — реже (пачка №9, пак 1). Шестую вкладку в панель не ставим: подписи
  // и так 11 пикселей.
  { href: "/instructor/sessions", label: "Сессии", hint: "мои записи · правка", primary: true },
  { href: "/instructor/clients", label: "Клиенты", hint: "база · поиск" },
  { href: "/instructor/calendar", label: "Календарь", hint: "смены · записи" },
  { href: "/instructor/stats", label: "Статистика", hint: "за любой период" },
  { href: "/instructor/subscription", label: "Абонемент", hint: "продажа" },
  { href: "/instructor/writeoff", label: "Списание", hint: "минуты" },
  { href: "/instructor/expenses", label: "Расходы", hint: "свои траты" },
  { href: UPDATES_HREF, label: "Обновления", hint: "что нового в кабинете" },
  { href: "/instructor/settings", label: "Настройки", hint: "имя · фото · цель" },
];

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
  "relative flex flex-1 items-center justify-center rounded-xl px-1 py-2.5 text-[11px] font-bold leading-tight transition-colors";
const mobileTabActive = "bg-primary text-white shadow-sm";
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

  // Что инструктор уже прочитал — во внешнем хранилище (localStorage), поэтому
  // useSyncExternalStore, а не эффект с setState (на такой эффект ругается
  // линтер, и страница рисовалась бы дважды — тот же разбор, что в BookingNo).
  // Сервер отдаёт null: до гидратации мы не знаем, читал человек ленту или нет,
  // и молча не зажигаем точку.
  const updatesSeen = useSyncExternalStore(
    subscribeUpdatesSeen,
    readUpdatesSeen,
    () => null,
  );
  // Зашёл на вкладку — считаем ленту прочитанной. Пишем в эффекте (это запись
  // наружу, не состояние React), точка гаснет по событию из markUpdatesSeen.
  useEffect(() => {
    if (pathname.startsWith(UPDATES_HREF)) markUpdatesSeen();
  }, [pathname]);
  const hasNewUpdates = updatesSeen !== null && updatesSeen < LATEST_UPDATE;

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

  const profile = (
    <div className="flex shrink-0 items-center gap-3 rounded-2xl border border-line bg-surface p-4">
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

  const links = (
    <nav className="flex flex-col gap-1">
      {withBadges.map((item) => {
        const isActive = item.href === active.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            aria-current={isActive ? "page" : undefined}
            className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
              isActive
                ? "bg-primary text-white"
                : "text-foreground hover:bg-line/50"
            }`}
          >
            <span className="min-w-0">
              <span className="block truncate">{item.label}</span>
              {item.hint && (
                <span
                  className={`block truncate text-xs font-normal ${
                    isActive ? "text-white/70" : "text-muted"
                  }`}
                >
                  {item.hint}
                </span>
              )}
            </span>
            {item.badge ? <CountBubble count={item.badge} /> : null}
            {item.dot ? (
              <span
                aria-label="есть новое"
                className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500"
              />
            ) : null}
          </Link>
        );
      })}
      <form action={logoutAction} className="mt-1">
        <button
          type="submit"
          className="w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-muted transition-colors hover:bg-line/50"
        >
          Выход
        </button>
      </form>
    </nav>
  );

  return (
    <aside className="md:h-full md:w-64 md:shrink-0">
      {/* ПК: колонка на всю высоту со своим скроллом (не уезжает с контентом) */}
      <div className="scroll-soft hidden md:flex md:h-full md:flex-col md:gap-4 md:overflow-y-auto md:overscroll-contain md:py-6 md:pr-1">
        {profile}
        {links}
      </div>

      {/* Телефон: фиксированная нижняя панель + выезжающий лист «Ещё» */}
      <div className="md:hidden">
        {open && (
          <>
            <button
              type="button"
              aria-label="Закрыть меню"
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-black/40"
            />
            <div className="fixed inset-x-0 bottom-0 z-50 max-h-[80dvh] space-y-3 overflow-y-auto rounded-t-2xl border-t border-line bg-bg p-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
              {profile}
              {links}
            </div>
          </>
        )}

        <nav className={mobileBarClass}>
          {primaryItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={isActive ? "page" : undefined}
                className={`${mobileTabClass} ${isActive ? mobileTabActive : mobileTabIdle}`}
              >
                <span className="max-w-full truncate">{item.short ?? item.label}</span>
                {item.badge ? (
                  <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-surface">
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
        </nav>
      </div>
    </aside>
  );
}
