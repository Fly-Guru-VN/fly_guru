"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import {
  LOCALES,
  LOCALE_NAMES,
  LOCALE_SHORT,
  type AppLocale,
} from "@/i18n/locales";
import { IconCheck, IconChevronDown, IconGlobe } from "./icons";

// Планетка в шапке: выбор языка сайта.
//
// Стоит рядом с логотипом намеренно — там её ищут глазами на любом сайте мира,
// и она видна ДО того, как человек начал читать (а читать он, возможно, не
// может: попал на язык, которого не знает).
//
// Флагов нет и не будет. Флаг — это страна, а не язык: испанский под флагом
// Испании обижает мексиканца, английский под британским — американца, а
// китайский вообще не сводится к одному флагу. Название языка на самом языке
// понятнее любой картинки.
export function LocaleSwitcher() {
  const t = useTranslations("Header");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const locale = useLocale() as AppLocale;
  const pathname = usePathname();
  const router = useRouter();
  const boxRef = useRef<HTMLDivElement>(null);

  // Закрытие «наружным» нажатием и по Esc. pointerdown, а не click: иначе
  // список успевал закрыться раньше, чем срабатывал выбор языка внутри него.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const select = (next: AppLocale) => {
    setOpen(false);
    if (next === locale) return;

    // pathname приходит уже без языкового префикса, а вот параметры адреса
    // (?ref=..., utm-метки) в нём не лежат — их дописываем руками. Иначе смена
    // языка молча теряла бы реф-код агента, и переход не засчитался бы никому.
    const search = window.location.search;
    startTransition(() => {
      router.replace(`${pathname}${search}`, { locale: next });
    });
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("language")}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={pending}
        className="inline-flex h-10 items-center gap-1 rounded-xl bg-white/15 pl-2 pr-1.5 text-white transition-[background-color,transform] duration-150 hover:bg-white/25 active:scale-95 disabled:opacity-70"
      >
        <IconGlobe className="h-5 w-5" />
        <span className="text-[13px] font-bold tracking-wide">
          {LOCALE_SHORT[locale]}
        </span>
        <IconChevronDown
          className={`h-4 w-4 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Список языков. Не размонтируется, а прячется: так он умеет уезжать
          обратно с той же анимацией, с какой приехал. inert обязателен —
          иначе Tab заводит в невидимые кнопки. */}
      <div
        role="menu"
        aria-label={t("language")}
        inert={!open}
        className={`absolute left-0 top-full z-50 mt-2 w-44 origin-top-left rounded-2xl bg-surface p-1.5 shadow-[0_12px_32px_rgba(11,110,127,0.22)] ring-1 ring-line transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
          open
            ? "visible scale-100 opacity-100"
            : "invisible -translate-y-1 scale-95 opacity-0"
        }`}
      >
        {LOCALES.map((code) => {
          const current = code === locale;
          return (
            <button
              key={code}
              type="button"
              role="menuitem"
              lang={code}
              onClick={() => select(code)}
              className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                current
                  ? "bg-primary/10 text-primary-strong"
                  : "text-ink hover:bg-surface-2"
              }`}
            >
              {LOCALE_NAMES[code]}
              {current && <IconCheck className="h-4 w-4 shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
