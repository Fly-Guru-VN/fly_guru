import Image from "next/image";
import { IconStar } from "./icons";
import { GoogleMapsLink } from "./GoogleMapsLink";
import type { Review } from "@/content/reviews";

// Карточка отзыва с главной, собрана по макету: фото с занятия сверху, под ним
// текст, а стык закрыт волной.
//
// Волна — не CSS-фигура, а картинка (media/photo/reviews/wave.webp): в ней
// нарисованные полупрозрачные струи воды поверх фото и белая заливка под ними.
// Поэтому её достаточно прижать к низу кадра — белое поле картинки само
// сливается с телом карточки, и граница получается волнистой, без стыка.
//
// Текст обрезаем девятью строками: на телефоне полный отзыв — это пол-экрана
// на карточку. На /reviews карточка та же, но там за отзывами и приходят —
// clamp={false} снимает обрезку и показывает текст целиком.
export function ReviewPhotoCard({ review, clamp = true }: { review: Review; clamp?: boolean }) {
  return (
    <figure className="flex h-full flex-col overflow-hidden rounded-3xl bg-surface shadow-[0_20px_45px_-30px_rgba(15,34,51,0.55)]">
      <div className="relative aspect-[16/9] w-full">
        {review.photo && (
          <Image
            src={review.photo}
            alt=""
            aria-hidden
            fill
            sizes="(min-width: 768px) 33vw, 85vw"
            className="object-cover"
          />
        )}
        {/* Кавычки в белом кружке — как в макете, поверх левого верхнего угла кадра. */}
        <span
          aria-hidden
          className="absolute left-4 top-4 flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-white/95 shadow-[0_6px_16px_-8px_rgba(15,34,51,0.6)]"
        >
          {/* Начертание с засечками — ради формы самих кавычек: в наборном
              шрифте сайта у них квадратное основание, а в макете круглое, с
              хвостиком (как у запятой). Любой серифный шрифт рисует их именно
              так, поэтому глиф, а не картинка.
              Кавычки сдвинуты вниз: вся «краска» глифа в верхней части строки,
              и по центру бокса он визуально висит под самым краем. */}
          <span className="mt-[0.34em] font-serif text-[3rem] font-bold leading-none text-primary-strong">
            &ldquo;
          </span>
        </span>
        {/* Волна. Ширина картинки чуть больше карточки: у самых краёв волна
            сходит на нет, и на стыке с рамкой был виден тонкий просвет. */}
        <Image
          src="/media/photo/reviews/wave.webp"
          alt=""
          aria-hidden
          width={1200}
          height={152}
          sizes="(min-width: 768px) 33vw, 85vw"
          className="absolute -inset-x-px bottom-0 w-[calc(100%_+_2px)] max-w-none"
        />
      </div>

      <div className="flex flex-1 flex-col p-6">
        <div className="flex gap-1.5 text-accent" aria-label={`Оценка ${review.rating} из 5`}>
          {Array.from({ length: review.rating }).map((_, i) => (
            <IconStar key={i} className="h-5 w-5" />
          ))}
        </div>
        <blockquote className="mt-4 flex-1 text-ink">
          <p className={`leading-relaxed ${clamp ? "line-clamp-[9]" : ""}`}>{review.text}</p>
        </blockquote>
        <figcaption className="mt-6 flex gap-3">
          {review.avatar && (
            <Image
              src={review.avatar}
              alt=""
              aria-hidden
              width={96}
              height={96}
              className="h-10 w-10 shrink-0 rounded-full object-cover"
            />
          )}
          <div className="min-w-0">
            <p className="font-semibold leading-tight">{review.name}</p>
            {review.role && <p className="mt-0.5 text-sm text-muted">{review.role}</p>}
            {review.sourceUrl && <GoogleMapsLink href={review.sourceUrl} className="mt-1.5" />}
          </div>
        </figcaption>
      </div>
    </figure>
  );
}
