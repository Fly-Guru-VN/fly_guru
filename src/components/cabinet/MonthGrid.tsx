import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";

// Месячная сетка календаря (пак H1) — общая для кабинетов админа, инструктора и
// механика. Презентационный server-компонент: раскладку месяца
// (понедельник-первый) считает сам, а содержимое ячейки и ссылку дня получает от
// страницы — у админа день кликабелен (панель дня), у инструктора может быть
// read-only.
//
// Оформление (27.07.2026): раньше ячейки разделяла серая решётка — сетка
// `gap-px` на сплошном сером фоне. На телефоне это выглядело грубо, а «хвосты»
// соседних месяцев серыми заливками читались как дыры. Теперь дни — отдельные
// плитки с промежутками внутри одной мягкой карточки, хвосты прозрачные,
// выходные чуть подкрашены, чтобы неделя читалась глазом.

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export function MonthGrid({
  ym,
  today,
  selected,
  renderCell,
  hrefFor,
}: {
  ym: string; // 'YYYY-MM'
  today: string; // 'YYYY-MM-DD' — подсветка сегодня
  selected?: string; // выбранный день (панель дня открыта)
  renderCell: (dateStr: string) => ReactNode; // контент дня
  hrefFor?: (dateStr: string) => string | undefined; // ссылка дня (undefined = не кликаем)
}) {
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7; // Пн=0 … Вс=6
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();

  // Ячейки: пустые «хвосты» до 1-го числа + дни месяца.
  const cells: ({ dateStr: string; dayNum: number } | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ dateStr: `${ym}-${String(d).padStart(2, "0")}`, dayNum: d });
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-2 shadow-[0_1px_3px_rgba(15,34,51,0.04)] sm:p-3">
      <div className="grid grid-cols-7 gap-1 pb-1 text-center text-[10px] font-bold uppercase tracking-wide text-muted">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={i >= 5 ? "text-muted/60" : undefined}>
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, i) => {
          // Хвост прошлого месяца — просто пустое место, без заливки.
          if (!cell) return <div key={`e${i}`} className="min-h-17" />;

          const isToday = cell.dateStr === today;
          const isSelected = cell.dateStr === selected;
          const isWeekend = i % 7 >= 5;
          const href = hrefFor?.(cell.dateStr);

          const inner = (
            <>
              <div
                className={`text-xs font-bold ${
                  isToday
                    ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white"
                    : isWeekend
                      ? "text-muted/70"
                      : "text-ink/70"
                }`}
              >
                {cell.dayNum}
              </div>
              <div className="mt-1">{renderCell(cell.dateStr)}</div>
            </>
          );

          // Выбранный день — мягкая заливка, сегодня — тонкое кольцо, остальные
          // дни отличаются только тоном подложки (будни светлее выходных).
          // Тонкая граница у каждой плитки — то самое «более явное разделение
          // ячеек»: одной заливки мало, на светлом фоне дни сливались.
          const tone = isSelected
            ? "bg-primary/10 ring-1 ring-inset ring-primary/40"
            : isToday
              ? "bg-surface ring-1 ring-inset ring-primary/40"
              : isWeekend
                ? "border border-line bg-surface-2/70"
                : "border border-line/70 bg-bg";

          const base = `min-h-17 rounded-xl p-1.5 text-left transition-colors sm:min-h-26 ${tone}`;

          return href ? (
            <Link
              key={cell.dateStr}
              href={href}
              className={`${base} block hover:bg-primary/5`}
            >
              {inner}
            </Link>
          ) : (
            <div key={cell.dateStr} className={base}>
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}
