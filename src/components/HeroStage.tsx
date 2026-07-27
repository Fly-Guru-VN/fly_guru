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
  videoMobile,
  poster,
  image,
  alt = "",
  bleed = false,
  dim = "strong",
  children,
}: {
  video?: string;
  // Тот же ролик полегче — для телефонов. Браузер выбирает источник ОДИН раз,
  // при загрузке (media у <source>), поэтому на узком экране качается только
  // мобильный файл, а не полуторный кадр «на всякий случай».
  videoMobile?: string;
  poster?: string;
  // Фото вместо видео. alt описывает кадр — он не декоративный, на нём и есть
  // то, что мы продаём.
  image?: string;
  alt?: string;
  // bleed — кадр во всю ширину сайта и вплотную к цветной шапке (главная).
  // Без него кадр остаётся карточкой со скруглениями внутри контейнера.
  bleed?: boolean;
  // Насколько глушить кадр. «soft» — для ярких солнечных роликов: там сильная
  // заливка убивает всю картинку, а текст и так читается благодаря тени.
  dim?: "strong" | "soft";
  children: ReactNode;
}) {
  const overlay =
    dim === "soft"
      ? "bg-gradient-to-t from-black/70 via-black/25 to-transparent"
      : "bg-gradient-to-t from-black/85 via-black/45 to-black/10";

  return (
    <section className={bleed ? "" : "md:px-6 md:pt-6"}>
      <div
        className={`relative isolate flex min-h-[86svh] flex-col justify-end overflow-hidden ${
          bleed
            ? // Во всю ширину и без скруглений: верх кадра стыкуется с шапкой
              // встык, как одна цельная картинка. Высота — экран минус шапка,
              // чтобы под кадром не оставалось пустой полосы.
              "md:h-[calc(100svh-4rem)] md:min-h-[560px]"
            : "md:mx-auto md:h-[70vh] md:min-h-[520px] md:max-w-6xl md:rounded-3xl"
        }`}
      >
        {video ? (
          <video
            poster={poster}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            aria-hidden
            className="absolute inset-0 -z-10 h-full w-full object-cover"
          >
            {videoMobile && <source src={videoMobile} media="(max-width: 767px)" type="video/mp4" />}
            <source src={video} type="video/mp4" />
          </video>
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
            открытым — там небо, горы и город. */}
        <div className={`absolute inset-0 -z-10 ${overlay}`} />
        <div className="px-4 pb-10 pt-28 text-white sm:px-6 md:px-10 md:pb-12">
          {/* Ширину текста держим по общему контейнеру сайта, иначе на широком
              мониторе заголовок уезжал бы к самому краю окна. */}
          <div className={bleed ? "mx-auto w-full max-w-6xl" : ""}>{children}</div>
        </div>
      </div>
    </section>
  );
}
