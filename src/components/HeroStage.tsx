import type { ReactNode } from "react";
import Image from "next/image";

// Первый экран страницы: кадр во весь экран, поверх — затемнение и текст.
// Кадром может быть зацикленное видео (главная) или фотография (обучение).
//
// Зачем так. Раньше сверху лежала стена текста, а живое видео с полётом — под
// ней, и на телефоне его видел только тот, кто доскроллил. Продаёт здесь именно
// вода и полёт, поэтому кадр идёт первым, а слова ложатся на него.
//
// Высоту меряем в svh (small viewport height): это высота экрана БЕЗ учёта
// адресной строки, которая на телефоне то прячется, то возвращается. С обычным
// vh кнопки уезжали бы под строку браузера.
export function HeroStage({
  video,
  poster,
  image,
  alt = "",
  children,
}: {
  video?: string;
  poster?: string;
  // Фото вместо видео. alt описывает кадр — он не декоративный, на нём и есть
  // то, что мы продаём.
  image?: string;
  alt?: string;
  children: ReactNode;
}) {
  return (
    <section className="md:px-6 md:pt-6">
      <div className="relative isolate flex min-h-[86svh] flex-col justify-end overflow-hidden md:mx-auto md:h-[70vh] md:min-h-[520px] md:max-w-6xl md:rounded-3xl">
        {video ? (
          <video
            src={video}
            poster={poster}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            aria-hidden
            className="absolute inset-0 -z-10 h-full w-full object-cover"
          />
        ) : (
          <Image
            src={image!}
            alt={alt}
            fill
            priority
            quality={90}
            sizes="(min-width: 768px) 1152px, 100vw"
            className="-z-10 object-cover"
          />
        )}
        {/* Затемнение снизу вверх: текст читается, а верх кадра остаётся
            открытым — там как раз горы и небо. */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/45 to-black/10" />
        <div className="px-4 pb-10 pt-28 text-white sm:px-6 md:p-10">{children}</div>
      </div>
    </section>
  );
}
