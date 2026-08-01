import type { SVGProps } from "react";

// Лёгкие инлайн-SVG иконки (line-art в стиле IG-иконок FlyGuru).
// Без внешних зависимостей → не влияют на скорость загрузки.

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconTandem(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="9" cy="5" r="2" />
      <circle cx="16" cy="6.5" r="1.5" />
      <path d="M9 7v4m0 0-2 3m2-3 2 2" />
      <path d="M16 8v3l-2 2" />
      <path d="M3 19c3-1.5 5-1.5 9 0s6 1.5 9 0" />
    </svg>
  );
}

export function IconFoil(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 8c5-1.5 11-1.5 16 0-1 1.6-3.5 2.5-8 2.5S5 9.6 4 8Z" />
      <path d="M12 10.5V16" />
      <path d="M8.5 19c1.5-1 5.5-1 7 0" />
    </svg>
  );
}

// Звёзды (эта и IconStar) построены по правилу: 10 вершин вокруг центра
// 12,12 — внешние на радиусе R, внутренние на 0.38 R, через 36°. Прежние пути
// рисовались на глаз, и у обеих нижняя внутренняя вершина стояла слишком
// низко: у контурной нижние лучи выходили обрубками, а у залитой сливались в
// полукруг. Менять координаты вручную больше не надо — считать по формуле.
export function IconClub(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3.2 13.98 9.28 20.37 9.28 15.19 13.04 17.17 19.12 12 15.36 6.83 19.12 8.81 13.04 3.63 9.28 10.02 9.28Z" />
    </svg>
  );
}

export function IconWaves(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 8c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
      <path d="M3 13c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
      <path d="M3 18c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
    </svg>
  );
}

export function IconStar(props: IconProps) {
  return (
    <svg {...base} fill="currentColor" stroke="none" {...props}>
      <path d="M12 3 14.02 9.22 20.56 9.22 15.27 13.06 17.29 19.28 12 15.44 6.71 19.28 8.73 13.06 3.44 9.22 9.98 9.22Z" />
    </svg>
  );
}

export function IconPin(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 21s6-5.3 6-10a6 6 0 1 0-12 0c0 4.7 6 10 6 10Z" />
      <circle cx="12" cy="11" r="2.2" />
    </svg>
  );
}

export function IconPhone(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 3h3l1.5 5-2 1.5a12 12 0 0 0 6 6l1.5-2 5 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2Z" />
    </svg>
  );
}

export function IconChat(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 5h16v11H9l-4 3v-3H4V5Z" />
    </svg>
  );
}

export function IconArrowRight(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 12h14m-6-6 6 6-6 6" />
    </svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m5 12 4.5 4.5L19 7" />
    </svg>
  );
}

// ── Мелкие значки для плашек с фактами под карточками «Путь клиента» ──

export function IconClock(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 1.8" />
    </svg>
  );
}

export function IconPeople(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5" />
      <path d="M16 5.4a3 3 0 0 1 0 5.2" />
      <path d="M17.5 14.8c1.8.6 3 2 3.4 4.2" />
    </svg>
  );
}

export function IconShield(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3l7 2.6v5.2c0 4.3-2.9 8-7 9.2-4.1-1.2-7-4.9-7-9.2V5.6L12 3Z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </svg>
  );
}

// Знак бесконечности. Прошлая версия была нарисована двумя дугами «на глаз»:
// правая петля уезжала вниз и за пределы квадрата, и в мелком размере значок
// читался как случайная закорючка. Здесь обе петли — честные окружности r=4 с
// центрами (6,12) и (18,12), перекрестье ровно в середине.
export function IconInfinity(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 12c-1.7-2.3-3.4-3.5-5-3.5a3.5 3.5 0 1 0 0 7c1.6 0 3.3-1.2 5-3.5z" />
      <path d="M12 12c1.7 2.3 3.4 3.5 5 3.5a3.5 3.5 0 1 0 0-7c-1.6 0-3.3 1.2-5 3.5z" />
    </svg>
  );
}

// Пальма. Прошлая версия — прямой вертикальный ствол и три одинаковых луча от
// его макушки — читалась ветряком, а не деревом. Теперь два широких листа
// свисают в стороны почти до краёв квадрата, третий уходит вверх, ствол
// изогнут.
//
// Рисовалось под размер 20 px — в подвале карточки шага значок стоит именно
// таким. Что не работает в этом размере (проверено рендером): линия земли под
// стволом — с ней получается бегущий человечек; больше трёх листьев — крона
// схлопывается в кляксу; кокос точкой — лишний шум.
export function IconPalm(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12.5 9.5c-1.4 2.8-2 6.4-1.8 10.8" />
      <path d="M12.5 9.5c-3.8-2.4-7.4-1.2-9.5 2.6" />
      <path d="M12.5 9.5c3.8-2.4 7.4-1.2 9.5 2.6" />
      <path d="M12.5 9.5c-1-3 .3-5.4 3.2-6.6" />
    </svg>
  );
}

// Кнопка мобильного меню. Раньше тут стояли символы «☰» и «✕» из шрифта: у них
// разная ширина и разная высота над базовой линией, поэтому значок сидел не по
// центру кнопки и при открытии заметно «прыгал». Иконки рисуем сами — обе
// ровно по сетке 24×24, центр совпадает.
export function IconMenu(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function IconClose(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}
