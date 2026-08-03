"use client";

import { buttonClasses } from "./ui";
import { IconPlay } from "./icons";

// Кнопка «Смотреть видео» рядом с заголовком блока на телефоне: прокручивает
// страницу к ролику ниже и сразу его запускает.
//
// Зачем отдельная кнопка: на узком экране ролик лежит ПОД четырьмя шагами, и
// доезжает до него далеко не каждый. Обычной ссылкой-якорем тут не обойтись —
// она только прокрутит, а нажатие на кнопку это ещё и жест пользователя,
// единственный момент, когда iOS разрешает завести видео программно.
export function WatchVideoBtn({
  target,
  className = "",
}: {
  // id самого <video> на странице.
  target: string;
  className?: string;
}) {
  function go() {
    const video = document.getElementById(target) as HTMLVideoElement | null;
    if (!video) return;
    video.scrollIntoView({ behavior: "smooth", block: "center" });
    video.play().catch(() => {});
  }

  return (
    <button
      type="button"
      onClick={go}
      className={buttonClasses({
        variant: "secondary",
        className: `shrink-0 whitespace-nowrap px-4 py-2 text-xs ${className}`,
      })}
    >
      <IconPlay aria-hidden className="h-4 w-4" />
      Смотреть видео
    </button>
  );
}
