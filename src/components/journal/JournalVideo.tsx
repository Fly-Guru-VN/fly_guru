"use client";

import { useState } from "react";

// Ролик YouTube в посте. До нажатия — только обложка и кнопка: настоящий
// плеер YouTube весит около мегабайта скриптов и ставит свои куки, а статью
// читают и те, кто видео смотреть не станет. Плеер грузится по нажатию, с
// домена youtube-nocookie.com.
export function JournalVideo({ id, vertical }: { id: string; vertical: boolean }) {
  const [playing, setPlaying] = useState(false);
  // Shorts снят стоя: во всю ширину колонки он занял бы три экрана.
  const frame = vertical
    ? "mx-auto aspect-[9/16] w-full max-w-sm"
    : "aspect-video w-full";

  if (playing) {
    return (
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
        title="Видео YouTube"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className={`${frame} rounded-2xl bg-black`}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      aria-label="Смотреть видео"
      className={`group relative block overflow-hidden rounded-2xl bg-black ${frame}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- обложка с серверов YouTube; через наш оптимизатор картинок гонять её незачем */}
      <img
        src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
        alt=""
        loading="lazy"
        className="h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
      />
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-white shadow-lg transition-transform group-hover:scale-105">
          <svg viewBox="0 0 24 24" className="ml-1 h-7 w-7" fill="currentColor" aria-hidden>
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
      </span>
    </button>
  );
}
