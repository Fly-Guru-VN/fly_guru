"use client";

import { useState } from "react";
import Image from "next/image";
import { Link, usePathname } from "@/i18n/navigation";
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

const NAV: NavItem[] = [
  { href: "/mechanic/calendar", label: "Календарь", hint: "смены · записи", primary: true },
  { href: "/mechanic/record", label: "Записать клиента", short: "Записать", hint: "новая заявка", primary: true },
  { href: "/mechanic/shift", label: "Смена", hint: "открыть · закрыть · фото", primary: true },
  { href: "/mechanic/sessions", label: "Сессии", hint: "что откатали", primary: true },
  { href: "/mechanic/expenses", label: "Расходы", hint: "свои траты" },
  { href: "/mechanic/settings", label: "Настройки", hint: "имя · фото" },
];

// Подписи в нижней панели — 11 пикселей, поэтому активная вкладка залита
// цветом: на пляже под солнцем цвет читается, а оттенок текста нет.
const mobileBarClass =
  "fixed inset-x-0 bottom-0 z-30 flex gap-1 border-t border-line bg-surface px-1 pt-1 pb-[calc(0.25rem+env(safe-area-inset-bottom))] shadow-[0_-2px_12px_rgba(15,34,51,0.10)]";
const mobileTabClass =
  "relative flex flex-1 items-center justify-center rounded-xl px-1 py-2.5 text-[11px] font-bold leading-tight transition-colors";
const mobileTabActive = "bg-primary text-white shadow-sm";
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
        <p className="truncate text-xs text-muted">Механик</p>
      </div>
    </div>
  );

  const links = (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const isActive = item.href === active.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            aria-current={isActive ? "page" : undefined}
            className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
              isActive ? "bg-primary text-white" : "text-foreground hover:bg-line/50"
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
      {/* ПК: колонка на всю высоту со своим скроллом */}
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
          </button>
        </nav>
      </div>
    </aside>
  );
}
