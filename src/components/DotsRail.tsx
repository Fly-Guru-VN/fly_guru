"use client";

import { useRef, useState, type ReactNode } from "react";
import { Rail } from "./Rail";

// Лента с точками-индикаторами под ней (как в макете): отзывы и шаги на главной.
//
// Точки нужны только на телефоне: на ПК все карточки стоят в ряд и считать
// нечего. Сами карточки приходят готовыми из серверного компонента — здесь
// только прокрутка, поэтому «use client» на них не распространяется.
//
// as="ol" — для шагов: там карточки нумерованные и должны остаться списком.
export function DotsRail({
  children,
  count,
  as = "div",
  className = "",
}: {
  children: ReactNode;
  count: number;
  as?: "div" | "ol";
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);

  function onScroll() {
    const el = ref.current;
    if (!el) return;
    // Шаг = ширина карточки вместе с зазором. Считаем по факту, а не по
    // константе: ширина карточки задана в процентах от экрана.
    const step = el.scrollWidth / count;
    const i = Math.min(count - 1, Math.max(0, Math.round(el.scrollLeft / step)));
    if (i !== active) setActive(i);
  }

  return (
    <>
      {/* Зазор шире обычного (28 px вместо 16): карточка занимает 85% экрана,
          и при поле в 16 px справа выглядывало 43 px соседней — отзыв визуально
          жался к левому краю. С 28 px просветы слева и справа почти равны, и
          карточка стоит по центру. */}
      <Rail
        as={as}
        scrollRef={ref}
        onScroll={onScroll}
        gutter="-mx-4 px-7 scroll-px-7 sm:-mx-6 sm:px-6 sm:scroll-px-6"
        className={`mt-8 ${className}`}
      >
        {children}
      </Rail>
      <div className="mt-5 flex justify-center gap-2 md:hidden" aria-hidden>
        {Array.from({ length: count }).map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === active ? "w-6 bg-primary" : "w-1.5 bg-ink/20"
            }`}
          />
        ))}
      </div>
    </>
  );
}
