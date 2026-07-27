import type { ReactNode } from "react";

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

export function Rail({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rail -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 md:mx-0 md:grid md:gap-6 md:overflow-visible md:px-0 ${className}`}
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
