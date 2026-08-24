import Image from "next/image";
import { IconStar } from "./icons";
import { GoogleMapsLink } from "./GoogleMapsLink";
import type { Review } from "@/content/reviews";

// Карточка отзыва без фото — для /reviews, где отзывов два десятка и кадра к
// ним нет.
//
// Собрана в родстве с карточкой на главной (ReviewPhotoCard): те же
// скругления, та же тень, та же подпись с аватаром и каплей Google. Отличие
// одно: вместо фото с занятия в углу лежит бледная кавычка — иначе карточка
// без картинки читалась бы просто белым прямоугольником с текстом.
//
// clamp — обрезка текста девятью строками. По умолчанию выключена: на /reviews
// за отзывами и приходят, читают целиком.
export function ReviewCard({ review, clamp = false }: { review: Review; clamp?: boolean }) {
  return (
    // break-inside-avoid — карточки раскладываются кладкой (CSS columns), и без
    // этого длинный отзыв разрывался бы посередине между колонками.
    <figure className="relative flex break-inside-avoid flex-col overflow-hidden rounded-3xl border border-line bg-surface p-6 shadow-[0_18px_40px_-30px_rgba(15,34,51,0.5)]">
      {/* Кавычка — тем же серифным глифом, что в кружке на карточке с фото, но
          крупная и бледная: это фон, а не значок. Сдвинута за верхний край,
          чтобы «краска» глифа попала в угол, а не висела под ним. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-3 right-4 select-none font-serif text-[6rem] leading-none text-primary/10"
      >
        &ldquo;
      </span>

      <div className="relative flex gap-1 text-accent" aria-label={`Оценка ${review.rating} из 5`}>
        {Array.from({ length: review.rating }).map((_, i) => (
          <IconStar key={i} className="h-4 w-4" />
        ))}
      </div>

      <blockquote className="relative mt-3 flex-1 text-ink">
        <p className={`leading-relaxed ${clamp ? "line-clamp-[9]" : ""}`}>{review.text}</p>
      </blockquote>

      {/* Подпись отделена линией: у карточек разной высоты глаз ищет, где
          кончается чужая речь и начинается имя. */}
      <figcaption className="mt-5 flex gap-3 border-t border-line pt-4">
        {review.avatar ? (
          <Image
            src={review.avatar}
            alt=""
            aria-hidden
            width={96}
            height={96}
            className="h-10 w-10 shrink-0 rounded-full object-cover"
          />
        ) : (
          // Аватарки в Google есть не у всех. Кружок с первой буквой имени
          // держит ту же сетку подписи, что и у соседей с фотографией.
          <span
            aria-hidden
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 font-bold text-primary-strong"
          >
            {review.name.trim().charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <p className="font-semibold leading-tight">{review.name}</p>
          {review.role && <p className="mt-0.5 text-sm text-muted">{review.role}</p>}
          {review.sourceUrl && <GoogleMapsLink href={review.sourceUrl} className="mt-1.5" />}
        </div>
      </figcaption>
    </figure>
  );
}
