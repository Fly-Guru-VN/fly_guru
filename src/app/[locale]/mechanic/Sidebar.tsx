"use client";

import { useState } from "react";
import Image from "next/image";
import { Link, usePathname } from "@/i18n/navigation";
import { LinkSpinner } from "@/components/Spinner";
import { SlidingHighlight } from "@/components/SlidingHighlight";
import { logoutAction } from "../login/actions";

// Боковое меню кабинета механика — тот же компонент, что у инструктора
// (на ПК колонка, на телефоне нижняя панель + лист «Ещё»), с двумя отличиями:
// в профиле нет ЗП (механику её не считают) и нет красного счётчика записей —
// вкладки заявок у него тоже нет, он их только заводит.

type NavItem = {
  href: string;
  label: string;
  short?: string;
  hint?: string;
  primary?: boolean;
};

// Разделы группами — как в админке и у инструктора (10.08.2026). Подписи под
// названиями убраны: группа уже объясняет, зачем сюда идут, а на телефоне это
// был лишний текст.
const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Каждый день",
    items: [
      { href: "/mechanic/calendar", label: "Календарь", hint: "смены · записи", primary: true },
      { href: "/mechanic/record", label: "Записать клиента", short: "Записать", hint: "новая заявка", primary: true },
      { href: "/mechanic/shift", label: "Смена", hint: "открыть · закрыть · фото", primary: true },
      { href: "/mechanic/sessions", label: "Сессии", hint: "что откатали", primary: true },
    ],
  },
  {
    title: "Своё",
    items: [
      { href: "/mechanic/expenses", label: "Расходы", hint: "свои траты" },
      { href: "/mechanic/settings", label: "Настройки", hint: "имя · фото" },
    ],
  },
];

const NAV: NavItem[] = GROUPS.flatMap((g) => g.items);

// Подписи в нижней панели — 11 пикселей, поэтому активная вкладка залита
// цветом: на пляже под солнцем цвет читается, а оттенок текста нет.
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
}: {
  name: string;
  photoUrl: string | null;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const active = NAV.find((item) => pathname.startsWith(item.href)) ?? NAV[0];
  const primaryItems = NAV.filter((item) => item.primary);
  const moreActive = !primaryItems.some((item) => pathname.startsWith(item.href));

  // Карточка профиля: на ПК — шапка панели меню, в мобильном листе — прежняя
  // отдельная карточка.
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
        <p className="truncate text-xs text-muted">Механик</p>
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
      </Link>
    );
  };

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
            {group.items.map((item) => navLink(item, big))}
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
      {/* ПК: меню — отдельная панель-карточка на всю высоту со своим скроллом,
          чтобы навигация не сливалась с содержимым раздела. */}
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
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                data-tab={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`${mobileTabClass} ${isActive ? mobileTabActive : mobileTabIdle}`}
              >
                <span className="max-w-full truncate">{item.short ?? item.label}</span>
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
