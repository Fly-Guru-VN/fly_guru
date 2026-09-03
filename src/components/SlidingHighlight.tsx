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
// ── Почему плашка едет ТОЛЬКО через transform ──
// Браузер отдаёт видеокарте всего два свойства: transform и opacity. Всё
// остальное — ширину, clip-path, радиус — рисует главный поток, тот самый, где
// работает React и переход на новую страницу. Обе прежние версии плашки ехали
// главным потоком (сначала width/height, потом clip-path) и замирали ровно в
// момент приземления: там React пересобирает карточки прайса или браузер уходит
// на новую страницу, поток занят — кадры не рисуются (David, 03.09.2026:
// «подвисает в момент фиксации на иконке»).
//
// Поэтому теперь у плашки ПОСТОЯННЫЙ размер (по самой широкой вкладке ряда), а
// на нужную вкладку она встаёт переездом и растяжением:
// translate3d(...) scale(...). Такая анимация идёт на видеокарте и не может
// подвиснуть, чем бы ни был занят главный поток.
//
// Растяжение превратило бы круглые торцы в овалы, поэтому радиус задаётся
// раздельно по горизонтали и вертикали (border-radius: rx / ry) и делится на
// масштаб: в покое форма точная. Радиус НЕ анимируется намеренно — это работа
// для главного потока, а ради неё портить главное движение незачем: в полёте
// торцы едва заметно «упругие», и это движению только на пользу.

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
  // Постоянный размер плашки — самая широкая и самая высокая вкладка ряда.
  // Всё остальное получается из него масштабом.
  baseWidth: number;
  baseHeight: number;
}

// Кривая переезда по умолчанию — упругая, с лёгким перелётом: плашка чуть
// проскакивает цель и возвращается. Так она ведёт себя в шапке сайта и в нижних
// панелях.
//
// Перелёт именно ЛЁГКИЙ (1.2, а не 1.56 как было): через полменю плашка едет
// далеко, и заметный отскок в конце читается не как упругость, а как дёрганье.
const DEFAULT_MOTION =
  "transition-transform duration-[450ms] ease-[cubic-bezier(0.34,1.2,0.64,1)] motion-reduce:transition-none";

export function SlidingHighlight({
  activeKey,
  pillClassName,
  pillRadius = 9999,
  followHover = false,
  motionClassName = DEFAULT_MOTION,
  className = "",
  children,
}: {
  activeKey: string | null;
  /** Как выглядит сама плашка — заливка и тень: скругление задаётся pillRadius. */
  pillClassName: string;
  /** Скругление плашки в пикселях. По умолчанию таблетка (радиус в полвысоты). */
  pillRadius?: number;
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
    // Размер плашки берём по самой крупной вкладке ряда: от неё считается
    // масштаб, и он получается не больше единицы — плашка всегда сжимается,
    // никогда не растягивается сверх своего разрешения.
    let baseWidth = 0;
    let baseHeight = 0;
    for (const tab of root.querySelectorAll<HTMLElement>("[data-tab]")) {
      baseWidth = Math.max(baseWidth, tab.offsetWidth);
      baseHeight = Math.max(baseHeight, tab.offsetHeight);
    }
    const next = {
      left: el.offsetLeft,
      top: el.offsetTop,
      width: el.offsetWidth,
      height: el.offsetHeight,
      baseWidth,
      baseHeight,
    };
    // Тот же прямоугольник — тот же объект: иначе каждый вызов measure()
    // (а его дёргает наблюдатель за размерами) перерисовывал бы ряд заново.
    setBox((prev) =>
      prev &&
      prev.left === next.left &&
      prev.top === next.top &&
      prev.width === next.width &&
      prev.height === next.height &&
      prev.baseWidth === next.baseWidth &&
      prev.baseHeight === next.baseHeight
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
      // Саму плашку НЕ наблюдаем: её размер постоянен, но наблюдатель всё равно
      // поднимал бы лишний пересчёт на её появление.
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

  // Масштаб плашки и раздельные радиусы под него: рисованный радиус равен
  // css-радиусу, умноженному на масштаб, поэтому css-радиус на масштаб делим.
  let style: React.CSSProperties | undefined;
  if (box && box.baseWidth > 0 && box.baseHeight > 0) {
    const scaleX = box.width / box.baseWidth;
    const scaleY = box.height / box.baseHeight;
    // Таблетка (радиус 9999) на деле скругляется вполвысоты — с этим числом и
    // считаем, иначе браузер ужал бы радиусы сам и по-своему.
    const radius = Math.min(pillRadius, box.height / 2, box.width / 2);
    style = {
      width: box.baseWidth,
      height: box.baseHeight,
      transformOrigin: "0 0",
      transform: `translate3d(${box.left}px, ${box.top}px, 0) scale(${scaleX}, ${scaleY})`,
      borderRadius: `${radius / scaleX}px / ${radius / scaleY}px`,
      // Слой под плашку браузер готовит заранее, а не в момент первого движения
      // — иначе первый переезд начинается с рывка.
      willChange: "transform",
    };
  }

  return (
    <div ref={ref} className={`relative ${className}`} {...hoverProps}>
      {style && (
        <span
          aria-hidden
          data-sliding-pill=""
          className={`pointer-events-none absolute left-0 top-0 ${pillClassName} ${
            animate ? motionClassName : ""
          }`}
          style={style}
        />
      )}
      {children}
    </div>
  );
}
