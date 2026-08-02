import type { ReactNode } from "react";

// FAQ на нативном <details> — раскрывается без JavaScript (быстро и доступно).
export interface FaqEntry {
  q: string;
  a: ReactNode;
}

// heading — заголовок ВНУТРИ карточки, первой строкой над вопросами. Так
// заголовок и список читаются одним блоком, а не подписью и отдельной плашкой
// под ней. Разделитель под ним рисует общий divide-y, отдельной линии не надо.
export function Faq({ items, heading }: { items: FaqEntry[]; heading?: string }) {
  return (
    <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {heading && (
        <h2 className="p-5 text-xl font-bold text-primary sm:text-2xl">{heading}</h2>
      )}
      {items.map((item, i) => (
        <details key={i} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 font-semibold">
            <span>{item.q}</span>
            <span className="shrink-0 text-primary transition-transform group-open:rotate-45" aria-hidden>
              +
            </span>
          </summary>
          <div className="px-5 pb-5 text-muted">{item.a}</div>
        </details>
      ))}
    </div>
  );
}
