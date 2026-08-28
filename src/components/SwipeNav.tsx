"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { MOBILE_TABS } from "./nav";

// Пролистывание разделов пальцем на телефоне (идея David, 28.08.2026).
//
// Ведёшь пальцем — содержимое идёт следом и чуть отстаёт; отпустил дальше
// порога — уезжает за край, и открывается соседний раздел из нижней панели, а
// новая страница въезжает с той стороны, откуда пришла. Плашка в панели
// переезжает сама, ей достаточно смены адреса.
//
// Честно про устройство: это ЖЕСТ, а не бесконечная лента. Соседняя страница
// живёт по своему адресу и в браузер ещё не загружена — показать её край под
// пальцем нечем. Поэтому под пальцем едет текущая страница, а соседняя
// въезжает следом (Next успевает: разделы статические и подгружены заранее
// ссылками панели).
//
// Что жест НЕ должен ломать — и как это сделано:
//  • горизонтальные ленты внутри страниц (Rail, вкладки прайса) — жест,
//    начатый внутри прокручиваемого вбок элемента, игнорируется целиком;
//  • системный «назад» свайпом от края экрана — у обоих краёв мёртвая зона;
//  • обычную вертикальную прокрутку — как только палец уходит вниз-вверх,
//    жест снимается и в этом касании больше не включается;
//  • ссылку под пальцем — «хвостовой» клик после жеста съедаем (swallowClick).
//
// ⚠️ Слушатели навешаны вручную, а не через onTouchMove у <div>: React
// регистрирует touchmove ПАССИВНЫМ, а нам нужен preventDefault. Без него
// браузер считает горизонтальное движение своим жестом «назад» и уходит из
// раздела по истории — на замерах страница улетала аж в about:blank.

// Порог: дальше него отпущенный палец листает раздел. 60px — примерно ширина
// большого пальца, случайным движением столько не проезжают.
const THRESHOLD = 60;
// Содержимое идёт медленнее пальца — так видно, что страница «тяжёлая» и
// тянется, а не приклеена. Полное следование за пальцем на краю списка
// выглядит поломкой.
const DRAG = 0.35;
// У самых краёв экрана жест не начинаем: там системный «назад».
const EDGE = 24;
// Насколько страница отъезжает перед сменой адреса и с какого сдвига въезжает
// новая. Меньше ширины экрана намеренно: полный вылет читается как задержка.
const EXIT = 110;
const ENTER = 48;
// Сколько ждём «хвостовой» клик после жеста, см. swallowClick.
const CLICK_WINDOW = 300;

// Съесть клик, который браузер досылает следом за касанием.
//
// Пойманное на замерах (28.08.2026): палец ведут по карточке услуги, страница
// послушно едет — а в конце браузер всё равно выдаёт click по элементу под
// пальцем, и вместо соседнего раздела открывается ссылка карточки. Для
// браузера жест закончился обычным тапом, отличить его от нашего он не может.
// Поэтому первый клик после пролистывания гасим на фазе перехвата — до того,
// как он дойдёт до ссылки. Если клика не случилось (палец увели с ссылки),
// сторож снимается сам через CLICK_WINDOW и обычным тапам не мешает.
function swallowClick() {
  const kill = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.removeEventListener("click", kill, true);
  };
  window.addEventListener("click", kill, true);
  window.setTimeout(
    () => window.removeEventListener("click", kill, true),
    CLICK_WINDOW,
  );
}

export function SwipeNav({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const hostRef = useRef<HTMLDivElement>(null);

  // Сдвиг содержимого. Ноль — трансформации нет вовсе: transform на предке
  // делает его точкой отсчёта для fixed-потомков, и любая липкая панель внутри
  // страницы прилипла бы к нему, а не к экрану.
  const [offset, setOffset] = useState(0);
  const [smooth, setSmooth] = useState(false);
  // С какой стороны въезжать новой странице (0 — пришли не свайпом).
  const enterFrom = useRef(0);

  const index = MOBILE_TABS.findIndex(
    (t) => pathname === t.href || pathname.startsWith(`${t.href}/`),
  );
  // Роутер живёт в ref, а не в зависимостях слушателей: useRouter отдаёт
  // новый объект на каждый рендер, а рендеры идут потоком, пока палец ведёт
  // страницу. Пересобирать на каждом кадре слушатели нельзя — вместе с ними
  // обнулился бы и сам жест.
  const push = useRef(router.push);
  useEffect(() => {
    push.current = router.push;
  });

  useEffect(() => {
    const host = hostRef.current;
    // Свайп живёт только внутри четвёрки вкладок: с главной или отзывов
    // «соседнего раздела» просто нет.
    if (!host || index < 0) return;

    // idle — палец опустился, направление ещё не понятно;
    // swipe — ведём страницу; off — это касание не наше.
    let mode: "idle" | "swipe" | "off" = "off";
    let startX = 0;
    let startY = 0;
    let startT = 0;
    let dx = 0;

    // Соседний раздел в сторону движения пальца: палец влево — следующая
    // вкладка. Нет соседа — null, дальше край.
    const neighbour = (d: number) =>
      MOBILE_TABS[index + (d < 0 ? 1 : -1)]?.href ?? null;

    const onStart = (e: TouchEvent) => {
      mode = "off";
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      if (t.clientX < EDGE || t.clientX > window.innerWidth - EDGE) return;

      // Жест, начатый в ленте, которую листают вбок, принадлежит ленте.
      let el = e.target as HTMLElement | null;
      while (el && el !== host) {
        if (el.scrollWidth > el.clientWidth + 4) {
          const ox = getComputedStyle(el).overflowX;
          if (ox === "auto" || ox === "scroll") return;
        }
        el = el.parentElement;
      }

      mode = "idle";
      startX = t.clientX;
      startY = t.clientY;
      startT = Date.now();
      dx = 0;
    };

    const onMove = (e: TouchEvent) => {
      if (mode === "off") return;
      dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;

      if (mode === "idle") {
        // Пока не ясно, куда ведут, не мешаем: вертикаль — это прокрутка, и
        // касание отдаём ей навсегда. Множитель 1.5 — чтобы диагональ уходила
        // прокрутке: промахнуться вертикалью проще, чем горизонталью.
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
          mode = "off";
          return;
        }
        if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        mode = "swipe";
        setSmooth(false);
      }

      // Движение теперь наше — и браузер о своём жесте «назад» пусть забудет.
      if (e.cancelable) e.preventDefault();
      // На краю списка сопротивление втрое сильнее: страница чуть поддаётся и
      // тем говорит «дальше некуда» — вместо мёртвой неподвижности.
      setOffset(dx * (neighbour(dx) ? DRAG : DRAG / 3));
    };

    const onEnd = () => {
      if (mode !== "swipe") {
        mode = "off";
        return;
      }
      mode = "off";
      // Жест был — значит это не тап, чем бы он ни кончился.
      swallowClick();

      const href = neighbour(dx);
      // Быстрый короткий флик — тоже пролистывание: до порога палец не доехал,
      // но намерение однозначное.
      const flick = Date.now() - startT < 250 && Math.abs(dx) > 30;

      setSmooth(true);
      if (!href || (Math.abs(dx) < THRESHOLD && !flick)) {
        setOffset(0);
        return;
      }

      enterFrom.current = dx < 0 ? 1 : -1;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setOffset(0);
        push.current(href);
        return;
      }
      // Страница уезжает за край и уводит адрес за собой. Задержка ровно на
      // длину отъезда: без неё новая страница подменяет старую на середине
      // движения, и переход выглядит рывком.
      setOffset(dx < 0 ? -EXIT : EXIT);
      window.setTimeout(() => push.current(href), 130);
    };

    host.addEventListener("touchstart", onStart, { passive: true });
    host.addEventListener("touchmove", onMove, { passive: false });
    host.addEventListener("touchend", onEnd);
    host.addEventListener("touchcancel", onEnd);
    return () => {
      host.removeEventListener("touchstart", onStart);
      host.removeEventListener("touchmove", onMove);
      host.removeEventListener("touchend", onEnd);
      host.removeEventListener("touchcancel", onEnd);
    };
  }, [index]);

  // Адрес сменился — ставим новую страницу за краем и отпускаем на место.
  // Двойной requestAnimationFrame: браузер должен успеть нарисовать сдвинутое
  // состояние, иначе он схлопнет оба в одно и анимации не будет.
  useEffect(() => {
    if (!enterFrom.current) {
      setOffset(0);
      return;
    }
    const from = enterFrom.current;
    enterFrom.current = 0;
    setSmooth(false);
    setOffset(from * ENTER);
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setSmooth(true);
        setOffset(0);
      }),
    );
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  return (
    <div
      ref={hostRef}
      style={{
        transform: offset ? `translateX(${offset}px)` : undefined,
        transition: smooth
          ? "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)"
          : undefined,
      }}
    >
      {children}
    </div>
  );
}
