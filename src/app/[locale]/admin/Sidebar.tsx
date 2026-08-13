"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Link, usePathname } from "@/i18n/navigation";
import { LinkSpinner } from "@/components/Spinner";
import { SlidingHighlight } from "@/components/SlidingHighlight";
import {
  ADMIN_UPDATES_SEEN_KEY,
  useUpdatesSeen,
} from "@/components/cabinet/useUpdatesSeen";
import { logoutAction } from "../login/actions";

// Боковое меню админки. На ПК — узкая колонка слева (sticky). На телефоне —
// фиксированная нижняя панель с 4 главными разделами + «Ещё» (лист со всеми
// остальными). Активный блок подсвечивается (сравниваем с usePathname).
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

const UPDATES_HREF = "/admin/updates";

// Разделы сгруппированы по смыслу (10.08.2026). Шестнадцать пунктов подряд,
// у каждого подпись под названием, — это полтора экрана серого текста, по
// которому глаз каждый раз ищет заново. Группы дают опору: «деньги — вон тот
// кусок списка», и до нужного пункта долетаешь не читая.
//
// Порядок групп — по частоте: сначала то, что открывают каждый день.
const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Каждый день",
    items: [
      { href: "/admin/bookings", label: "Заявки", hint: "актуальные", primary: true },
      { href: "/admin/record", label: "Записать клиента", short: "Записать", hint: "провести занятие", primary: true },
      { href: "/admin/calendar", label: "Календарь", hint: "смены · записи по дням", primary: true },
      { href: "/admin/sessions", label: "Сессии", hint: "занятия · задним числом" },
    ],
  },
  {
    title: "Люди",
    items: [
      { href: "/admin/clients", label: "Клиенты", hint: "поиск · карточки" },
      { href: "/admin/subscriptions", label: "Абонементы", hint: "оплаты · минуты" },
      { href: "/admin/agents", label: "Агенты", hint: "реф-ссылки · награды" },
      { href: "/admin/members", label: "Члены клуба", hint: "инвайты · кабинеты" },
    ],
  },
  {
    title: "Деньги",
    items: [
      { href: "/admin/dashboard", label: "Статистика", hint: "месяц цифрами", primary: true },
      { href: "/admin/payroll", label: "Выплата зарплаты", hint: "кому должны · история" },
      { href: "/admin/expenses", label: "Расходы", hint: "марина · зп · прочее" },
    ],
  },
  {
    title: "Реклама",
    items: [
      { href: "/admin/materials", label: "Материалы", hint: "ссылки для рекламы" },
      { href: "/admin/sources", label: "Источники", hint: "переходы · заявки · выручка" },
    ],
  },
  {
    title: "Система",
    items: [
      { href: "/admin/services", label: "Услуги", hint: "цены · справочник" },
      // Не primary: шестую вкладку в нижнюю панель телефона не ставим (подписи
      // там и так 11 пикселей), раздел живёт в листе «Ещё» — как у инструктора.
      { href: UPDATES_HREF, label: "Обновления", hint: "что нового в системе" },
      { href: "/admin/settings", label: "Настройки", hint: "имя · фото" },
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

// Нижняя панель телефона — те же классы, что в кабинете инструктора
// (src/app/[locale]/instructor/Sidebar.tsx). Активная вкладка залита цветом,
// как пункт меню на ПК: на пляже под солнцем разницы в оттенке подписи было
// не видно, и админ промахивался мимо раздела.
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
  freshCount,
}: {
  name: string;
  photoUrl: string | null;
  amountLabel: string;
  amountSub: string;
  freshCount: number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Красная точка «есть новое» на «Обновлениях» — общая механика с кабинетом
  // инструктора, ключ в localStorage свой (прочитанное у админа не гасит точку
  // инструктору, который зашёл с того же телефона).
  const { hasNew: hasNewUpdates, markSeen } = useUpdatesSeen(
    ADMIN_UPDATES_SEEN_KEY,
  );
  // Зашёл на вкладку — лента прочитана. Пишем в эффекте (это запись наружу, не
  // состояние React), точка гаснет по событию из markSeen.
  useEffect(() => {
    if (pathname.startsWith(UPDATES_HREF)) markSeen();
  }, [pathname, markSeen]);

  const withBadges = NAV.map((item) => {
    if (item.href === "/admin/bookings") return { ...item, badge: freshCount };
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
        <p className="truncate text-xs text-muted">{name}</p>
        {/* Прибыль — то, ради чего сюда смотрят, поэтому она и есть главная
            строка карточки, а имя ушло наверх мелким: своё имя не читают. */}
        <p className="truncate text-xl font-bold leading-tight text-primary">
          {amountLabel}
        </p>
        <p className="truncate text-xs text-muted first-letter:uppercase">{amountSub}</p>
      </div>
    </div>
  );

  // Один пункт меню. big — крупная строка для мобильного листа (в неё целятся
  // пальцем). Подписи (hint) не показываем нигде: на ПК про раздел уже сказала
  // группа, а в листе «Ещё» шестнадцать подписей — те самые полтора экрана
  // серого текста, ради которых лист приходилось прокручивать.
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

  // Разделы группами — и на ПК, и в мобильном листе «Ещё».
  //
  // Заголовок группы — подпись полки, а не пункт меню: мелкий капс с разрядкой,
  // приглушённый цвет и линия до правого края. Линия и есть главный сигнал —
  // у кликабельных пунктов её нет, поэтому названия групп больше не читаются
  // как ссылки, на которые почему-то не нажимается. select-none, чтобы они не
  // выделялись при попытке ткнуть.
  //
  // В листе «Ещё» раньше лежал плоский список всех шестнадцати разделов с
  // подписями: на ПК их давно разложили по группам, а на телефоне — где
  // экран меньше и текста должно быть меньше — осталось как было.
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
          и сливались с содержимым раздела: где кончается навигация и начинается
          сам раздел, глаз определял только по отступу. Высота — минус my-6,
          чтобы панель стояла вровень с колонкой контента. */}
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
            // Есть новые заявки, а админ не на этой вкладке — красим вкладку
            // целиком, а не только уголок. Кружок в 16 пикселей на телефоне
            // под солнцем не замечали (то же чинили инструктору), и новая
            // заявка могла провисеть необработанной полдня.
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
                кнопке админ с телефона про них не узнает. */}
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
