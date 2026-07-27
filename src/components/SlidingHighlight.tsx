"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

// Подсветка активной вкладки, которая ПЕРЕЕЗЖАЕТ с кнопки на кнопку, а не
// перекрашивается мгновенно. Кривая с перелётом (0.34, 1.56, 0.64, 1) — плашка
// чуть проскакивает цель и возвращается: то самое «упругая жидкость».
//
// Как пользоваться: обернуть ряд вкладок, каждой вкладке поставить
// data-tab="<ключ>" и передать activeKey. Разметку самих вкладок компонент не
// трогает — у шапки сайта и у нижней панели кабинета она разная.
//
// Важно: вкладки должны быть позиционированными (класс relative), иначе плашка
// накроет их текст — абсолютный элемент рисуется поверх непозиционированных
// соседей, даже если стоит в разметке раньше.
//
// followHover — плашка подтягивается к вкладке под курсором и возвращается к
// активной, когда мышь ушла. Только для ПК: на телефоне наведения нет.

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function SlidingHighlight({
  activeKey,
  pillClassName,
  followHover = false,
  className = "",
  children,
}: {
  activeKey: string | null;
  /** Как выглядит сама плашка (заливка, скругление). */
  pillClassName: string;
  followHover?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box | null>(null);
  // Первое измерение — без анимации, иначе плашка прилетала бы из угла экрана
  // при каждой загрузке страницы.
  const [animate, setAnimate] = useState(false);
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  const target = hoverKey ?? activeKey;

  const measure = useCallback(() => {
    const root = ref.current;
    if (!root || !target) {
      setBox(null);
      return;
    }
    const el = root.querySelector<HTMLElement>(
      `[data-tab="${CSS.escape(target)}"]`,
    );
    if (!el) {
      setBox(null);
      return;
    }
    setBox({
      left: el.offsetLeft,
      top: el.offsetTop,
      width: el.offsetWidth,
      height: el.offsetHeight,
    });
  }, [target]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  // Плашка едет только между уже измеренными позициями: анимацию включаем
  // сразу после первой отрисовки.
  useEffect(() => {
    if (box && !animate) {
      const id = requestAnimationFrame(() => setAnimate(true));
      return () => cancelAnimationFrame(id);
    }
  }, [box, animate]);

  // Ширина вкладок меняется вместе с окном (и когда у «Заявок» появляется
  // счётчик) — иначе плашка остаётся на старом месте.
  useEffect(() => {
    const root = ref.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(root);
    for (const child of Array.from(root.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [measure]);

  const hoverProps = followHover
    ? {
        // Делегирование вместо обработчиков на каждой вкладке: разметку вкладок
        // компонент не знает и знать не должен.
        onMouseOver: (e: React.MouseEvent) => {
          const el = (e.target as HTMLElement).closest<HTMLElement>("[data-tab]");
          setHoverKey(el?.dataset.tab ?? null);
        },
        onMouseLeave: () => setHoverKey(null),
      }
    : {};

  return (
    <div ref={ref} className={`relative ${className}`} {...hoverProps}>
      {box && (
        <span
          aria-hidden
          className={`pointer-events-none absolute left-0 top-0 ${pillClassName} ${
            animate
              ? "transition-[transform,width,height] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none"
              : ""
          }`}
          style={{
            transform: `translate3d(${box.left}px, ${box.top}px, 0)`,
            width: box.width,
            height: box.height,
          }}
        />
      )}
      {children}
    </div>
  );
}
