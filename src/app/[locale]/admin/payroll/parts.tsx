import { vnd } from "@/lib/stats";

// Общие кусочки вкладки «Выплата зарплаты» и карточки инструктора: подписи и
// строки расчёта должны выглядеть одинаково на обоих экранах.

// Подпись над крупной цифрой. Капсом и с разрядкой намеренно: цифр в строке
// две, они про разное, и подпись должна прочитаться раньше самого числа —
// иначе рядом стоят два похожих числа и непонятно, какое из них к чему.
export function StatLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-muted">
      {children}
    </p>
  );
}

export const CHIP = "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold";

// Строка в раскрывашке «Как посчитали»: подпись слева, число справа колонкой.
// Кегль здесь обычный (text-sm у родителя), а не 11 пикселей, как было: под
// раскрывашку лезут именно затем, чтобы прочитать, а не «увидеть, что текст
// есть». Итоговые строки отделяются чертой и жирным — глаз сразу цепляет,
// откуда взялась крупная цифра наверху.
export function DetailLine({
  label,
  hint,
  value,
  strong = false,
  negative = false,
}: {
  label: string;
  hint?: string;
  value: number;
  strong?: boolean;
  negative?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 py-1 ${
        strong ? "mt-1 border-t border-line pt-2 font-bold" : "text-muted"
      }`}
    >
      <span className="min-w-0">
        {label}
        {hint ? <span className="text-muted"> · {hint}</span> : null}
      </span>
      <span className="shrink-0 tabular-nums">
        {negative ? "− " : ""}
        {vnd(value)}
      </span>
    </div>
  );
}
