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

export function IconClub(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3l2.3 4.7 5.2.8-3.7 3.6.9 5.1L12 15l-4.6 2.4.9-5.1L4.6 8.5l5.1-.8L12 3Z" />
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
      <path d="M12 3l2.5 5.1 5.6.8-4 3.9 1 5.6L12 21.8 6.9 18.4l1-5.6-4-3.9 5.6-.8L12 3Z" />
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

export function IconInfinity(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M8.5 8.5a3.5 3.5 0 1 0 0 7c2.6 0 4-3.5 7-3.5a3.5 3.5 0 1 1 0 7c-3 0-4.4-3.5-7-3.5" />
    </svg>
  );
}

export function IconPalm(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 8v12" />
      <path d="M12 8c-2.6-2-5.2-1.7-7 .6" />
      <path d="M12 8c2.6-2 5.2-1.7 7 .6" />
      <path d="M12 8c-1.4-2.6-.6-4.8 1.6-6" />
      <path d="M9 20c1.6-1.2 4.4-1.2 6 0" />
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
