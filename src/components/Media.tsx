import { useTranslations } from "next-intl";
import Image from "next/image";

// Соотношение сторон задаём строкой «ширина/высота» — под каждый кадр своё,
// чтобы object-cover не срезал головы. Значения см. в src/content/media.ts.
type Ratio = `${number}/${number}`;

const box = (ratio: Ratio, rounded: string, className: string) => ({
  // w-full обязателен: у grid-элемента с `mx-auto` ширина иначе считается по
  // содержимому, а содержимое здесь — absolute-картинка, т.е. ноль.
  className: `relative w-full overflow-hidden bg-surface-2 ${rounded} ${className}`,
  style: { aspectRatio: ratio.replace("/", " / ") },
});

// next/image по умолчанию пережимает в quality=75 поверх наших WebP.
// 90 заметно чище на воде и небе; значение разрешено в next.config.ts.
const QUALITY = 90;

export function Media({
  src = "/placeholders/media.svg",
  ratio = "16/9",
  className = "",
  sizes = "100vw",
  priority = false,
  rounded = "rounded-2xl",
  alt,
}: {
  src?: string;
  ratio?: Ratio;
  className?: string;
  sizes?: string;
  priority?: boolean;
  rounded?: string;
  alt?: string;
}) {
  // Подпись по умолчанию нужна только плейсхолдеру — но и она переводится:
  // читалка экрана у незрячего гостя должна говорить на его языке.
  const t = useTranslations("Common");

  return (
    <div {...box(ratio, rounded, className)}>
      <Image
        src={src}
        alt={alt ?? t("photoPlaceholderAlt")}
        fill
        sizes={sizes}
        priority={priority}
        quality={QUALITY}
        className="object-cover"
      />
    </div>
  );
}

// Зацикленное видео без звука. Играет само, как «живое фото».
export function VideoLoop({
  src,
  poster,
  ratio = "16/9",
  className = "",
  rounded = "rounded-2xl",
  // Для видео на первом экране: грузим сразу, иначе — по мере прокрутки.
  priority = false,
}: {
  src: string;
  poster: string;
  ratio?: Ratio;
  className?: string;
  rounded?: string;
  priority?: boolean;
}) {
  return (
    <div {...box(ratio, rounded, className)}>
      <video
        src={src}
        poster={poster}
        autoPlay
        loop
        muted
        playsInline
        preload={priority ? "auto" : "none"}
        className="absolute inset-0 h-full w-full object-cover"
      />
    </div>
  );
}

// Видео с кнопкой play — для длинных роликов, которые не крутим фоном.
export function VideoPlayer({
  src,
  poster,
  ratio = "16/9",
  className = "",
  rounded = "rounded-2xl",
}: {
  src: string;
  poster: string;
  ratio?: Ratio;
  className?: string;
  rounded?: string;
}) {
  return (
    <div {...box(ratio, rounded, className)}>
      <video
        src={src}
        poster={poster}
        controls
        playsInline
        preload="none"
        className="absolute inset-0 h-full w-full object-cover"
      />
    </div>
  );
}
