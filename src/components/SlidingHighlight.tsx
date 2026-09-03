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
// перекрашивается мгновенно.
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
//
// ── Почему плашка нарисована вырезом, а не своим размером ──
// Раньше плашка была маленьким прямоугольником, которому на каждом кадре
// задавались новые ширина и высота. Изменение ширины — это «пересчитай
// раскладку», самая дорогая работа браузера, и делается она в том же потоке,
// что и весь остальной JS: часть кадров браузер просто не успевал нарисовать, и
// переезд выглядел рывками (David, 03.09.2026: «будто кадров мало»).
//
// Теперь плашка растянута на весь ряд и никогда не меняет размер, а видимым
// остаётся только прямоугольник над нужной вкладкой — его вырезает clip-path.
// Браузеру остаётся перекрасить кусок, раскладку он не трогает вовсе.
// Скругление задаётся прямо в вырезе (round), поэтому таблетка остаётся
// таблеткой на любой ширине — масштабированием так нельзя, круглые торцы
// превратились бы в овалы.
//
// ⚠️ Вырез не умеет выходить за края ряда: у крайних вкладок перелёт кривой не
// вылетает наружу, а упирается в край — плашка на миг чуть растягивается. На
// шапке это незаметно и даже приятно, но помнить об этом стоит.
//
// ⚠️ clip-path режет ВСЁ, что нарисовал элемент, включая box-shadow: тень у
// плашки задаётся не классом, а пропом pillShadow — она рисуется на обёртке
// поверх уже вырезанной плашки (filter: drop-shadow).

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
  // Размер всего ряда: от него считаются отступы выреза справа и снизу.
  rootWidth: number;
  rootHeight: number;
}

// Кривая переезда по умолчанию — упругая, с лёгким перелётом: плашка чуть
// проскакивает цель и возвращается. Так она ведёт себя в шапке сайта и в нижних
// панелях.
//
// 450 мс, а не 300: то же расстояние плашка проходит за 27 кадров вместо 18, и
// движение читается как жидкое, а не как несколько отдельных положений.
const DEFAULT_MOTION =
  "transition-[clip-path] duration-[450ms] ease-[cubic-bezier(0.34,1.4,0.64,1)] motion-reduce:transition-none";

export function SlidingHighlight({
  activeKey,
  pillClassName,
  pillRadius = "9999px",
  pillShadow,
  followHover = false,
  motionClassName = DEFAULT_MOTION,
  className = "",
  children,
}: {
  activeKey: string | null;
  /** Как выглядит сама плашка — только заливка: скругление задаётся pillRadius. */
  pillClassName: string;
  /** Скругление плашки, любая длина CSS. По умолчанию — таблетка. */
  pillRadius?: string;
  /** Тень плашки: значение для drop-shadow(), например "0 1px 2px rgb(0 0 0 / 0.05)". */
  pillShadow?: string;
  followHover?: boolean;
  /** Чем и как долго плашка едет. По умолчанию — упругая кривая шапки. */
  motionClassName?: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box | null>(null);
  // Первое измерение — без анимации, иначе плашка приезжала бы через весь ряд
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
    const next = {
      left: el.offsetLeft,
      top: el.offsetTop,
      width: el.offsetWidth,
      height: el.offsetHeight,
      rootWidth: root.offsetWidth,
      rootHeight: root.offsetHeight,
    };
    // Тот же прямоугольник — тот же объект: иначе каждый вызов measure()
    // (а его дёргает наблюдатель за размерами) перерисовывал бы ряд заново.
    setBox((prev) =>
      prev &&
      prev.left === next.left &&
      prev.top === next.top &&
      prev.width === next.width &&
      prev.height === next.height &&
      prev.rootWidth === next.rootWidth &&
      prev.rootHeight === next.rootHeight
        ? prev
        : next,
    );
  }, [target]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  // Плашка едет только между уже измеренными положениями: анимацию включаем
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
    for (const child of Array.from(root.children)) {
      // Саму плашку НЕ наблюдаем: она размером с весь ряд, и наблюдатель
      // поднимал бы пересчёт на её собственное появление.
      if (child instanceof HTMLElement && child.dataset.slidingPill !== undefined) continue;
      observer.observe(child);
    }
    return () => observer.disconnect();
  }, [measure]);

  const hoverProps = followHover
    ? {
        // Делегирование вместо обработчиков на каждой вкладке: разметку вкладок
        // компонент не знает и знать не должен.
        //
        // ⚠️ Слушаем pointerover и отсеиваем всё, что не мышь. Касание пальцем
        // шлёт и pointerover, и синтетический mouseover: плашка уезжала на
        // вкладку под пальцем и залипала там, потому что mouseleave после
        // касания не приходит. Наведение бывает только мышкой.
        onPointerOver: (e: React.PointerEvent) => {
          if (e.pointerType !== "mouse") return;
          const el = (e.target as HTMLElement).closest<HTMLElement>("[data-tab]");
          setHoverKey(el?.dataset.tab ?? null);
        },
        onPointerLeave: () => setHoverKey(null),
      }
    : {};

  // Вырез по активной вкладке: сверху, справа, снизу, слева — и скругление.
  const clipPath = box
    ? `inset(${box.top}px ${Math.max(0, box.rootWidth - box.left - box.width)}px ${Math.max(0, box.rootHeight - box.top - box.height)}px ${box.left}px round ${pillRadius})`
    : undefined;

  const pill = (
    <span
      aria-hidden
      data-sliding-pill=""
      className={`pointer-events-none absolute inset-0 ${pillClassName} ${
        animate ? motionClassName : ""
      }`}
      style={{ clipPath }}
    />
  );

  return (
    <div ref={ref} className={`relative ${className}`} {...hoverProps}>
      {box &&
        (pillShadow ? (
          <span
            aria-hidden
            data-sliding-pill=""
            className="pointer-events-none absolute inset-0"
            style={{ filter: `drop-shadow(${pillShadow})` }}
          >
            {pill}
          </span>
        ) : (
          pill
        ))}
      {children}
    </div>
  );
}
