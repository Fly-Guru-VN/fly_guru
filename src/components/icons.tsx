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

// Пальма — единственная иконка набора не из линий, а картинкой: готовый
// силуэт из макета. Линейная версия рядом с плотными соседками выглядела
// бледной закорючкой.
//
// Картинка залита фирменной бирюзой, и как простой <image> она несла этот цвет
// сама по себе — а на активной плашке вкладок («Выезды» в прайсе) плашка ровно
// такая же бирюзовая, и пальма пропадала целиком. Поэтому картинка работает
// МАСКОЙ: рисуем прямоугольник currentColor и вырезаем его по прозрачности
// пальмы (mask-type: alpha). Там, где иконка и раньше стояла в бирюзовом
// тексте (главная, клуб), внешне ничего не изменилось, а на цветной плашке она
// теперь белеет вместе с подписью, как все остальные иконки.
//
// id у маски постоянный: на странице пальма всегда одна, а если их станет две,
// обе сошлются на одну и ту же маску с тем же содержимым — хуже не будет.
export function IconPalm(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <mask id="fg-palm-mask" style={{ maskType: "alpha" }}>
        <image href="/media/icon/palm.png" x="0" y="0" width="24" height="24" />
      </mask>
      <rect
        width="24"
        height="24"
        fill="currentColor"
        mask="url(#fg-palm-mask)"
      />
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

// ── Значки блока магазина ──

// Ключ — «поддержка и сервис». Рожковый конец сверху слева, ручка уходит
// вниз-вправо: в 20 px это читается как инструмент, а не как палка с крючком.
export function IconWrench(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M15.5 3.5a5 5 0 0 0-6.1 6.2L4 15.1a2.3 2.3 0 0 0 3.2 3.2l5.4-5.4a5 5 0 0 0 6.2-6.1l-2.7 2.7-2.6-.7-.7-2.6 2.7-2.7Z" />
    </svg>
  );
}

// Гарантия качества: галочка в зубчатом кружке — тот же смысл, что у щита, но
// рядом с ним в одной строке щит бы дважды повторился.
export function IconBadgeCheck(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 2.8l2.1 1.7 2.7-.2.6 2.6 2.3 1.4-1.1 2.5 1.1 2.5-2.3 1.4-.6 2.6-2.7-.2L12 21.2l-2.1-1.7-2.7.2-.6-2.6-2.3-1.4L5.4 13l-1.1-2.5 2.3-1.4.6-2.6 2.7.2L12 2.8Z" />
      <path d="m8.8 12 2.2 2.2 4.2-4.4" />
    </svg>
  );
}

// ── Значки в подвале карточек форматов обучения ──

// Спасжилет — «снаряжение включено». Две полы с воротом-вырезом и застёжка
// посередине: в 20 px именно вырез отличает жилет от обычной футболки.
export function IconVest(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M8.5 3 5.5 4.6V20h13V4.6L15.5 3" />
      <path d="M8.5 3c0 2.3 1.6 3.8 3.5 3.8S15.5 5.3 15.5 3" />
      <path d="M12 6.8V20" />
      <path d="M5.5 11h3M15.5 11h3" />
    </svg>
  );
}

// Улыбка — «детская программа». Рядом с фойлами и щитами это единственный
// значок про настроение, поэтому детский формат узнаётся по нему сразу.
export function IconSmile(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.8 14c.8 1 1.9 1.5 3.2 1.5s2.4-.5 3.2-1.5" />
      <path d="M9.2 9.5h.01M14.8 9.5h.01" strokeWidth="2.2" />
    </svg>
  );
}

// Один человек в кадре — «инструктор на связи» и «1 на 1 с инструктором».
// Отличается от IconPeople тем, что фигура ровно одна.
export function IconUser(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 19.5c.7-3.2 3.2-5 6.5-5s5.8 1.8 6.5 5" />
    </svg>
  );
}

// Ползунки — «индивидуальный подход»: настройки, которые двигают под человека.
export function IconSliders(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M7 3.5v6M7 14.5v6M17 3.5v3.5M17 12v8.5" />
      <path d="M4.5 12h5M14.5 9.5h5" />
    </svg>
  );
}

// Стрелка вверх по ступенькам — «быстрый прогресс».
export function IconTrend(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3.5 17.5 9 12l3.5 3.5L20 8" />
      <path d="M15 8h5v5" />
    </svg>
  );
}

// Огонёк на плашке «Популярное».
export function IconFlame(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3.2c3.3 3 5 5.5 5 7.6a5 5 0 0 1-10 0c0-1 .4-2.1 1.2-3.3.5 1 1.1 1.6 1.8 1.9.3-2.6.9-4.7 2-6.2Z" />
    </svg>
  );
}

// Треугольник в кружке — «смотреть видео». Заливка у треугольника своя, не
// currentColor-контур: в мелком размере пустой треугольник читается хуже.
export function IconPlay(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M10.4 9.2v5.6l4.4-2.8-4.4-2.8Z" fill="currentColor" />
    </svg>
  );
}

// Квадрокоптер сбоку: два винта на лучах, корпус и шарик камеры снизу.
// Для съёмки с дрона в прайсе.
export function IconDrone(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3.5 6.5h5m7 0h5" />
      <path d="M6 6.5v1.6l3 1.9m9-3.5v1.6l-3 1.9" />
      <rect x="9" y="9.5" width="6" height="4.2" rx="1.6" />
      <circle cx="12" cy="16.8" r="1.7" />
    </svg>
  );
}

// Стрелки в углы — «развернуть на весь экран».
export function IconExpand(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 3.5H3.5V9M15 3.5h5.5V9M9 20.5H3.5V15M15 20.5h5.5V15" />
    </svg>
  );
}

/* ── Мессенджеры и соцсети ──────────────────────────────────────────────────
   Фирменные значки нарисованы тем же контуром, что и остальной набор: залитые
   логотипы рядом с line-art выглядели бы наклейками с чужого сайта. Узнаваемая
   форма сохранена, толщина линии общая. */

// Трубка внутри «пузыря» сообщения — WhatsApp.
export function IconWhatsApp(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M20.5 11.8a8.4 8.4 0 0 1-12.6 7.3l-4.4 1.4 1.5-4.2A8.4 8.4 0 1 1 20.5 11.8Z" />
      <path d="M9.3 8.9c.3 1.6 1.1 2.9 2.4 3.9.9.7 1.9 1.1 3 1.3l.8-1.3-1.9-1-.8.8c-.8-.5-1.5-1.1-1.9-1.9l.8-.8-1-1.9-1.4.9Z" />
    </svg>
  );
}

// Бумажный самолётик — Telegram.
export function IconTelegram(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M20.8 4.2 3.4 11a.4.4 0 0 0 0 .8l4.4 1.4 1.7 5a.4.4 0 0 0 .7.2l2.3-2.5 4.1 3a.4.4 0 0 0 .6-.2l3.9-14a.4.4 0 0 0-.3-.5Z" />
      <path d="m7.8 13.2 10.3-7.4-6 8.8-.2 3.9" />
    </svg>
  );
}

// «Z» в скруглённом квадрате — Zalo.
export function IconZalo(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M20.5 12.6c0 4.1-3.8 6.9-8.5 6.9-1 0-2-.1-2.9-.4l-5.6 1.4 1.6-3.5a6.6 6.6 0 0 1-1.6-4.4c0-4.1 3.8-7.6 8.5-7.6s8.5 3.5 8.5 7.6Z" />
      <path d="M9.2 9.9h5.4l-5.4 5.2h5.6" />
    </svg>
  );
}

// Конверт — почта.
export function IconMail(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="m4 7.5 7.1 5a1.6 1.6 0 0 0 1.8 0l7.1-5" />
    </svg>
  );
}

// Скруглённый квадрат, объектив и точка вспышки — Instagram.
export function IconInstagram(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <path d="M16.9 7.1h.01" strokeWidth="2.4" />
    </svg>
  );
}

// Экран с треугольником — YouTube.
export function IconYouTube(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="2.5" y="5.5" width="19" height="13" rx="4" />
      <path d="M10.4 9.4v5.2l4.4-2.6-4.4-2.6Z" />
    </svg>
  );
}

// Нота с «хвостом» — TikTok.
export function IconTikTok(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M14.2 3.5v10.4a3.6 3.6 0 1 1-3.6-3.6c.4 0 .8 0 1.1.2" />
      <path d="M14.2 3.5c.4 2.3 2 4 4.3 4.2" />
    </svg>
  );
}

// Буква «f» в скруглённом квадрате — Facebook.
export function IconFacebook(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <path d="M14.8 8.2h-1.2c-.9 0-1.5.6-1.5 1.5v9" />
      <path d="M9.8 12.4h4.6" />
    </svg>
  );
}

// Ценник — вкладка «Прайс» в нижней панели телефона.
export function IconTag(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 11.2V4.8c0-.44.36-.8.8-.8h6.4c.21 0 .42.08.57.23l8 8a.8.8 0 0 1 0 1.13l-6.61 6.61a.8.8 0 0 1-1.13 0l-8-8A.8.8 0 0 1 4 11.2Z" />
      <circle cx="8.2" cy="8.2" r="1.2" />
    </svg>
  );
}

// Календарь с плюсом — кнопка записи в нижней панели телефона.
export function IconCalendarPlus(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 9.5h17M8 3.5v3m8-3v3" />
      <path d="M12 12.5v4.5M9.75 14.75h4.5" />
    </svg>
  );
}
