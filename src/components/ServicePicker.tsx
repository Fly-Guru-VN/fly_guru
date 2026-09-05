"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CATEGORY_LABELS, formatVnd, type ServiceCategory } from "@/content/services";
import { IconChevronDown } from "./icons";
import type { ServiceOption } from "./BookingForm";

// Выбор услуги в форме записи — свёрнутый список вместо простыни карточек.
//
// Зачем: услуг больше десятка, и все они лежали на экране разом. На телефоне
// форма из-за этого прокручивалась в три экрана, а поля «дата» и «комментарий»
// человек находил не сразу (David, 04.09.2026: «они дохуя места занимают»).
// Теперь видна одна строка с выбранной услугой, а список открывается нажатием.
//
// Порядок услуг НЕ трогаем: он приходит уже разложенным по типажам
// (lib/serviceOrder.ts), базовым обучением вперёд. Здесь только расставляем
// заголовки групп — по местам, где сменилась категория. Отсортируй мы список
// заново, порядок разошёлся бы с остальными формами системы.
//
// Внутри — настоящие radio. Список остаётся в разметке и свёрнутым (его прячет
// та же связка grid-rows + visibility + inert, что и меню в шапке), поэтому
// клавиатура и скринридеры видят обычный набор переключателей, а форма — свой
// выбор.

interface Group {
  cat: ServiceCategory | "other";
  items: ServiceOption[];
}

function groupInOrder(services: ServiceOption[]): Group[] {
  const groups: Group[] = [];
  for (const s of services) {
    const cat = s.category ?? "other";
    const last = groups[groups.length - 1];
    if (last && last.cat === cat) last.items.push(s);
    else groups.push({ cat, items: [s] });
  }
  return groups;
}

function groupLabel(cat: ServiceCategory | "other"): string {
  return cat === "other" ? "Другое" : CATEGORY_LABELS[cat];
}

export function ServicePicker({
  services,
  value,
  onChange,
  discountFor,
}: {
  services: ServiceOption[];
  value: string;
  onChange: (id: string) => void;
  /** Скидка по ссылке агента для этой услуги, в донгах. 0 — скидки нет. */
  discountFor?: (service: ServiceOption) => number;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLFieldSetElement>(null);

  const chosen = services.find((s) => s.id === value) ?? services[0] ?? null;
  const groups = groupInOrder(services);

  // Закрываем по Esc и по нажатию мимо списка — как ведёт себя любой
  // выпадающий список: иначе он остаётся раскрытым на пол-формы.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const priceOf = (s: ServiceOption) => {
    const price = s.price ?? null;
    const discount = discountFor?.(s) ?? 0;
    return { price, discount };
  };

  return (
    <fieldset ref={rootRef}>
      <legend className="mb-1 block text-sm font-medium">Услуга</legend>

      {/* Свёрнутая строка. Это кнопка, а не поле: она только открывает список,
          а выбор хранят radio внутри. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className={`${
          open ? "border-primary ring-2 ring-primary/20" : "border-line"
        } flex w-full items-center gap-2 rounded-xl border bg-surface px-4 py-3 text-left transition-colors`}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base">
            {chosen?.name ?? "Выберите услугу"}
          </span>
        </span>
        {chosen && <Price {...priceOf(chosen)} compact />}
        <IconChevronDown
          aria-hidden
          className={`h-5 w-5 shrink-0 text-muted transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      <div
        id={panelId}
        inert={!open}
        className={`grid overflow-hidden transition-[grid-template-rows,visibility] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
          open ? "visible grid-rows-[1fr]" : "invisible grid-rows-[0fr]"
        }`}
      >
        {/* min-h-0 — чтобы строка сетки могла сжаться в ноль. Список выше
            экрана телефона не вырастает: он прокручивается сам, а не уносит
            кнопку «Записаться» вниз за пределы формы. */}
        <div className="min-h-0">
          <div className="mt-2 max-h-[min(60vh,22rem)] space-y-3 overflow-y-auto rounded-xl border border-line bg-surface p-2">
            {groups.map((g) => (
              <div key={g.cat}>
                <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                  {groupLabel(g.cat)}
                </p>
                <div className="space-y-1">
                  {g.items.map((s) => {
                    const { price, discount } = priceOf(s);
                    const isChosen = s.id === value;
                    return (
                      <label
                        key={s.id}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2.5 transition-colors ${
                          isChosen ? "bg-primary/10" : "hover:bg-primary/5"
                        }`}
                      >
                        <input
                          type="radio"
                          name="serviceId"
                          value={s.id}
                          checked={isChosen}
                          onChange={() => {
                            onChange(s.id);
                            setOpen(false);
                          }}
                          className="shrink-0 accent-primary"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium leading-snug">
                            {s.name}
                          </span>
                          {discount > 0 && (
                            <span className="block text-xs font-semibold text-accent-strong">
                              −{formatVnd(discount)} по ссылке агента
                            </span>
                          )}
                        </span>
                        <Price price={price} discount={discount} />
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </fieldset>
  );
}

// Цена услуги: обычная или перечёркнутая рядом с агентской.
// compact — вариант для свёрнутой строки, где места на две строки нет.
function Price({
  price,
  discount,
  compact = false,
}: {
  price: number | null;
  discount: number;
  compact?: boolean;
}) {
  if (price === null) return null;
  if (discount <= 0) {
    return (
      <span className="shrink-0 text-sm text-muted">{formatVnd(price)}</span>
    );
  }
  const final = formatVnd(Math.max(0, price - discount));
  if (compact) {
    return (
      <span className="shrink-0 text-sm font-bold text-accent-strong">
        {final}
      </span>
    );
  }
  return (
    <span className="shrink-0 text-right leading-tight">
      <span className="block text-xs text-muted line-through">
        {formatVnd(price)}
      </span>
      <span className="block text-sm font-bold text-accent-strong">{final}</span>
    </span>
  );
}
