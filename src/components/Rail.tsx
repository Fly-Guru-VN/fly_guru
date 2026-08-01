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
export function Rail({
  children,
  className = "",
  gutter = "-mx-4 px-4 scroll-px-4 sm:-mx-6 sm:px-6 sm:scroll-px-6",
  scrollRef,
  onScroll,
}: {
  children: ReactNode;
  className?: string;
  gutter?: string;
  scrollRef?: RefObject<HTMLDivElement | null>;
  onScroll?: () => void;
}) {
  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className={`rail ${gutter} flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 md:mx-0 md:grid md:gap-6 md:overflow-visible md:px-0 ${className}`}
    >
      {children}
    </div>
  );
}

// Карточка ленты. На телефоне занимает 85% ширины (край следующей выглядывает),
// на ПК — ячейку сетки.
export function RailItem({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`w-[85%] shrink-0 snap-start md:w-auto ${className}`}>{children}</div>
  );
}
