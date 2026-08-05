"use client";

import { useEffect, useRef, useState } from "react";
import { IconExpand } from "./icons";

// Ролик сборки фойла в карточке магазина: без звука, зациклен, разворачивается
// на весь экран.
//
// Два неочевидных решения:
//
//  • качаем и запускаем ролик, только когда карточка доехала до экрана
//    (IntersectionObserver + preload="none"). Блок стоит в самом низу главной,
//    а файл весит 2 МБ — с обычным autoPlay телефон тянул бы его сразу при
//    заходе на страницу, ради видео, которое большинство даже не увидит;
//  • полный экран на iPhone делается НЕ через requestFullscreen: там его нет ни
//    у div, ни у video. Работает только нестандартный webkitEnterFullscreen у
//    самого <video> — он открывает родной плеер iOS. Поэтому сначала пробуем
//    развернуть карточку, а если браузер не умеет — отдаём видео системе.
export function FoilVideo({
  src,
  poster,
  alt,
  shape = "aspect-video rounded-2xl",
}: {
  src: string;
  poster: string;
  // Не alt в прямом смысле (у video его нет) — подпись для читалок экрана.
  alt: string;
  // Форма рамки, пока ролик не развёрнут: горизонтальный в магазине,
  // вертикальный на тандеме. В полном экране форму задаёт сам экран.
  shape?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [full, setFull] = useState(false);

  useEffect(() => {
    const box = boxRef.current;
    const video = videoRef.current;
    if (!box || !video) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.25 },
    );
    io.observe(box);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === boxRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function expand() {
    const box = boxRef.current;
    const video = videoRef.current as
      | (HTMLVideoElement & { webkitEnterFullscreen?: () => void })
      | null;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      return;
    }
    // Клик — это жест пользователя, и это единственный момент, когда можно
    // завести ролик наверняка. Нужно для iOS в режиме энергосбережения: там
    // автозапуск запрещён даже без звука, видео стоит постером, и родной
    // полноэкранный плеер открывать по сути нечего.
    video?.play().catch(() => {});
    if (box?.requestFullscreen) {
      box.requestFullscreen().catch(() => video?.webkitEnterFullscreen?.());
      return;
    }
    video?.webkitEnterFullscreen?.();
  }

  return (
    <div
      ref={boxRef}
      className={`group relative isolate overflow-hidden ${
        full ? "flex items-center justify-center bg-black" : `${shape} bg-ink`
      }`}
    >
      <video
        ref={videoRef}
        poster={poster}
        loop
        muted
        playsInline
        preload="none"
        controls={full}
        aria-label={alt}
        className={`h-full w-full ${full ? "object-contain" : "object-cover"}`}
      >
        <source src={src} type="video/mp4" />
      </video>
      {/* Разворачивает не только уголок, но и весь кадр: на телефоне попасть
          пальцем в кнопку 40×40 в углу видео сложнее, чем ткнуть в само видео.
          В полном экране кнопка не нужна — там свои родные контролы. */}
      {!full && (
        <button
          type="button"
          onClick={expand}
          className="absolute inset-0 flex cursor-zoom-in items-start justify-end p-3"
        >
          <span className="sr-only">Открыть видео на весь экран</span>
          <span
            aria-hidden
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-colors group-hover:bg-black/65"
          >
            <IconExpand className="h-5 w-5" />
          </span>
        </button>
      )}
    </div>
  );
}
