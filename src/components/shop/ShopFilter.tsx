"use client";

import { useState, type ReactNode } from "react";

export type ShopFilterChip = { key: string; label: string };
export type ShopFilterItem = { id: string; tags: string[]; node: ReactNode };

// Чипы-фильтры над сеткой каталога: «Все модели · Lift Foils · Hobbywing» у
// досок и разделы у аксессуаров. Первый чип — «всё», у него key "all".
//
// Карточки рисует сервер и отдаёт готовыми; фильтр их не пересобирает, а
// прячет атрибутом hidden — в HTML для поисковика весь каталог на месте.
export function ShopFilter({
  chips,
  items,
  ariaLabel,
  gridClassName,
  aside,
}: {
  chips: ShopFilterChip[];
  items: ShopFilterItem[];
  ariaLabel: string;
  gridClassName: string;
  aside?: ReactNode; // справа от чипов на ПК: «Сравнить модели»
}) {
  const [active, setActive] = useState("all");

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        {/* Чипы переносятся на новую строку, а не листаются: их три-пять, и
            спрятанный за краем раздел никто бы не нашёл. */}
        <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              aria-pressed={c.key === active}
              onClick={() => setActive(c.key)}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                c.key === active
                  ? "border-primary bg-primary text-white"
                  : "border-primary/40 bg-surface text-primary-strong hover:border-primary"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        {aside}
      </div>
      <div className={gridClassName}>
        {items.map((it) => (
          <div
            key={it.id}
            hidden={active !== "all" && !it.tags.includes(active)}
            // Обёртка не должна ломать сетку: карточка тянется на всю ячейку.
            className="flex [&>*]:flex-1"
          >
            {it.node}
          </div>
        ))}
      </div>
    </>
  );
}
