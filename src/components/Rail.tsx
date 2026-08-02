import type { ReactNode, RefObject } from "react";

// Лента, которую на телефоне листают пальцем, а на ПК она разворачивается в
// обычную сетку.
//
// Зачем: на узком экране четыре карточки подряд — это два экрана прокрутки
// вслепую. В ленте видно край следующей карточки, и сразу понятно, что там есть
// ещё. Прилипание (snap) не даёт остановиться между карточками.
//
// Отрицательные поля — чтобы лента начиналась от самого края экрана, а не от
// поля контейнера: обрезанная карточка у края и есть подсказка «листай».
// Число колонок на ПК задаётся снаружи: md:grid-cols-3 / md:grid-cols-4.

// scrollRef и onScroll — если снаружи нужно следить за прокруткой ленты
// (например, чтобы подсветить точку-индикатор под ней).
//
// gutter — поля ленты на узком экране. Вместе с px обязательно идёт scroll-px
// того же размера: без него прилипание уводит вторую и третью карточки в самый
// край экрана, и только первая стоит с отступом. Размер можно переопределить
// снаружи, если карточке нужен зазор пошире.
//
// as — каким тегом рендерить. По умолчанию div, но шаги на главной — это
// нумерованный список: там лента должна быть <ol>, а карточки — <li>.
export function Rail({
  children,
  className = "",
  gutter = "-mx-4 px-4 scroll-px-4 sm:-mx-6 sm:px-6 sm:scroll-px-6",
  as: Tag = "div",
  scrollRef,
  onScroll,
}: {
  children: ReactNode;
  className?: string;
  gutter?: string;
  as?: "div" | "ol";
  scrollRef?: RefObject<HTMLElement | null>;
  onScroll?: () => void;
}) {
  return (
    <Tag
      // Тег выбирается пропом, и TS требует ссылку, подходящую СРАЗУ обоим
      // вариантам (div и ol). Такой ссылки не существует, поэтому приводим
      // тип: снаружи от элемента нужны только scrollLeft/scrollWidth, они есть
      // у любого.
      ref={scrollRef as RefObject<never> | undefined}
      onScroll={onScroll}
      className={`rail ${gutter} flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 md:mx-0 md:grid md:gap-6 md:overflow-visible md:px-0 ${className}`}
    >
      {children}
    </Tag>
  );
}

// Карточка ленты. На телефоне занимает 85% ширины (край следующей выглядывает),
// на ПК — ячейку сетки.
export function RailItem({
  children,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "li";
}) {
  return (
    <Tag className={`w-[85%] shrink-0 snap-start md:w-auto ${className}`}>{children}</Tag>
  );
}
