"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Link, usePathname } from "@/i18n/navigation";
import { LinkSpinner } from "@/components/Spinner";
import { SlidingHighlight } from "@/components/SlidingHighlight";
import { useUpdatesSeen } from "@/components/cabinet/useUpdatesSeen";
import { logoutAction } from "@/app/[locale]/login/actions";

// Боковое меню кабинета — одно на все четыре (админ, инструктор, механик,
// СММщик). Раньше это были четыре файла по три сотни строк, отличавшиеся только
// списком разделов: правка «активную вкладку залить цветом» или «убрать подписи
// под пунктами» делалась четыре раза, и кабинеты всё равно разъезжались —
// у СММщика, например, так и не появилась красная точка на кнопке «Ещё».
//
// Устройство одинаковое везде: на ПК — узкая колонка-карточка слева (свой
// скролл, не уезжает с контентом), на телефоне — фиксированная нижняя панель с
// главными разделами плюс «Ещё» (лист со всеми остальными). Активный раздел
// определяем по usePathname.
//
// Кабинет задаёт только данные: свои разделы (groups), что показывать в
// карточке профиля, где рисовать красный счётчик и есть ли у него лента
// обновлений.

// primary — раздел выносится в нижнюю панель на телефоне; short — короткая
// подпись для узкой ячейки этой панели.
export type CabinetNavItem = {
  href: string;
  label: string;
  short?: string;
  primary?: boolean;
};

export type CabinetNavGroup = { title: string; items: CabinetNavItem[] };

// Карточка профиля в шапке меню. Роль без денег («Механик», «СММ») — у тех,
// кому в кабинете нечего показывать цифрой; amount — крупная сумма (ЗП у
// инструктора, деньги школы у админа).
export type CabinetProfile = {
  name: string;
  photoUrl: string | null;
  role?: string;
  amount?: { label: string; sub: string };
  // Сумма — главная строка карточки, имя уезжает наверх мелким. Так в админке:
  // прибыль — то, ради чего в эту карточку смотрят, а своё имя не читают.
  amountFirst?: boolean;
};

function CountBubble({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
      {count}
    </span>
  );
}

// Нижняя панель телефона. Смотрят в неё на пляже, под прямым солнцем, — раньше
// активная вкладка отличалась только цветом подписи в 11 пикселей, и на
// выгоревшем экране разницы не было видно. Теперь активная вкладка — залитая
// плашка с белым текстом, как пункт меню на ПК: пятно цвета читается даже
// боковым зрением. Неактивные подписи — основным тёмным, по той же причине.
const mobileBarClass =
  "fixed inset-x-0 bottom-0 z-30 flex gap-1 border-t border-line bg-surface px-1 pt-1 pb-[calc(0.25rem+env(safe-area-inset-bottom))] shadow-[0_-2px_12px_rgba(15,34,51,0.10)]";
const mobileTabClass =
  "relative flex flex-1 items-center justify-center rounded-xl px-1 py-2.5 text-[11px] font-bold leading-tight transition-colors duration-150 active:scale-95";
// Заливку активной вкладки рисует не она сама, а плашка, которая переезжает
// между вкладками (SlidingHighlight) — поэтому здесь остался только цвет
// текста поверх этой плашки.
// delay: белым подпись становится не сразу, а когда плашка доехала. Иначе на
// треть секунды получалось белое по белому — вкладка «пропадала».
const mobileTabActive = "text-white delay-150";
const mobileTabIdle = "text-ink";

export function CabinetSidebar({
  groups,
  profile,
  badge,
  updates,
}: {
  groups: CabinetNavGroup[];
  profile: CabinetProfile;
  // Красный счётчик на одном разделе (новые заявки).
  badge?: { href: string; count: number };
  // Лента обновлений кабинета: адрес вкладки и свой ключ хранилища. Ключ у
  // каждого кабинета свой — иначе прочитанное в одном гасило бы точку в другом.
  updates?: { href: string; seenKey: string };
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Красная точка «есть новое» живёт в localStorage самого браузера.
  const { hasNew: hasNewUpdates, markSeen } = useUpdatesSeen(
    updates?.seenKey ?? null,
  );
  // Зашёл на вкладку — лента прочитана. Пишем в эффекте (это запись наружу, не
  // состояние React), точка гаснет по событию из markSeen.
  const updatesHref = updates?.href;
  useEffect(() => {
    if (updatesHref && pathname.startsWith(updatesHref)) markSeen();
  }, [pathname, updatesHref, markSeen]);

  const items = groups
    .flatMap((g) => g.items)
    .map((item) => ({
      ...item,
      badge: item.href === badge?.href ? badge.count : 0,
      dot: item.href === updatesHref && hasNewUpdates,
    }));
  // Раздел активен, если открыт он сам или что-то внутри него. Из нескольких
  // подходящих выигрывает САМЫЙ ДЛИННЫЙ адрес — иначе раздел, живущий по корню
  // кабинета, накрывает собой все остальные. Ровно это и случилось у агента
  // (25.08.2026): «Статистика» стоит на «/agent», простое startsWith считало её
  // активной и на «/agent/link», и на «/agent/payouts» — на ПК подсвечивался не
  // тот пункт, а плашка на телефоне не двигалась вовсе.
  const matchesPath = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);
  const bestMatch = <T extends { href: string }>(list: T[]): T | undefined =>
    list
      .filter((item) => matchesPath(item.href))
      .sort((a, b) => b.href.length - a.href.length)[0];

  const active = bestMatch(items) ?? items[0];
  // Нижняя панель телефона: главные разделы + «Ещё». «Ещё» подсвечиваем, когда
  // открыт раздел не из панели (или лист развёрнут).
  const primaryItems = items.filter((item) => item.primary);
  const activePrimary = bestMatch(primaryItems);
  const moreActive = !activePrimary;
  const byHref = new Map(items.map((item) => [item.href, item]));

  // Карточка профиля. На ПК она — шапка панели меню (рамку и фон даёт сама
  // панель, здесь остаётся только линия-отбивка), в мобильном листе —
  // отдельная карточка.
  const { name, photoUrl, amount, amountFirst, role } = profile;
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
        {amount && amountFirst ? (
          <>
            <p className="truncate text-xs text-muted">{name}</p>
            <p className="truncate text-xl font-bold leading-tight text-primary">
              {amount.label}
            </p>
            <p className="truncate text-xs text-muted first-letter:uppercase">
              {amount.sub}
            </p>
          </>
        ) : (
          <>
            <p className="truncate text-sm font-bold">{name}</p>
            {amount ? (
              <>
                <p className="truncate text-lg font-bold text-primary">
                  {amount.label}
                </p>
                <p className="truncate text-xs text-muted">{amount.sub}</p>
              </>
            ) : (
              <p className="truncate text-xs text-muted">{role}</p>
            )}
          </>
        )}
      </div>
    </div>
  );

  // Один пункт меню. big — крупная строка для мобильного листа (в неё целятся
  // пальцем). Подписей под названиями нет нигде: на ПК про раздел уже сказала
  // группа, а в листе «Ещё» полтора десятка подписей — это тот самый серый
  // текст, ради которого лист приходилось прокручивать.
  const navLink = (item: (typeof items)[number], big: boolean) => {
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

  // Разделы группами — и на ПК, и в мобильном листе «Ещё».
  //
  // Заголовок группы — подпись полки, а не пункт меню: мелкий капс с
  // разрядкой, приглушённый цвет и линия до правого края. Линия и есть главный
  // сигнал — у кликабельных пунктов её нет, поэтому названия групп не читаются
  // как ссылки, на которые почему-то не нажимается. select-none, чтобы они не
  // выделялись при попытке ткнуть.
  const groupedLinks = (big: boolean) => (
    <nav className="flex flex-col gap-3">
      {groups.map((group) => (
        <div key={group.title}>
          <div className="flex select-none items-center gap-2 px-3 pb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted/80">
              {group.title}
            </span>
            <span aria-hidden className="h-px flex-1 bg-line" />
          </div>
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const withBadge = byHref.get(item.href);
              return withBadge ? navLink(withBadge, big) : null;
            })}
          </div>
        </div>
      ))}
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
            activeKey={moreActive || open ? "more" : (activePrimary?.href ?? null)}
            pillClassName="rounded-xl bg-primary shadow-sm"
            className="flex flex-1 gap-1"
          >
            {primaryItems.map((item) => {
              const isActive = item.href === activePrimary?.href;
              // Есть новые заявки, а человек не на этой вкладке — красим
              // вкладку целиком, а не только уголок. Кружок в 16 пикселей на
              // пляже под солнцем не замечали, и заявка могла провисеть
              // необработанной полдня.
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
                  <span className="max-w-full truncate">
                    {item.short ?? item.label}
                  </span>
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
                  кнопке с телефона про них не узнают. */}
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
