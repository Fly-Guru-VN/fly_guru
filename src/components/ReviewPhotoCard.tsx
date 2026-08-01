import Image from "next/image";
import { IconStar } from "./icons";
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
// на карточку. Целиком отзывы читаются на /reviews.
export function ReviewPhotoCard({ review }: { review: Review }) {
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
          {/* Кавычки сдвинуты вниз: у глифа вся «краска» в верхней части
              строки, и по центру бокса он визуально висит под самым краем. */}
          <span className="mt-[0.42em] text-[2.6rem] font-bold leading-none text-primary-strong">
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
          <p className="line-clamp-[9] leading-relaxed">{review.text}</p>
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
            {review.sourceUrl && (
              <a
                href={review.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"
              >
                Отзыв в <span className="text-[#4285f4]">Google Maps</span>
                <IconMapPin className="h-4 w-4" />
              </a>
            )}
          </div>
        </figcaption>
      </div>
    </figure>
  );
}

// Метка Google Maps: капля в четырёх фирменных цветах. Лежит тут, а не в общем
// icons.tsx, — единственное место, где нужен чужой бренд, и цвета у неё свои,
// а не currentColor.
function IconMapPin({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <defs>
        <clipPath id="gmaps-pin">
          <path d="M12 2.2c-3.9 0-7 3.1-7 7 0 5.2 7 12.6 7 12.6s7-7.4 7-12.6c0-3.9-3.1-7-7-7z" />
        </clipPath>
      </defs>
      <g clipPath="url(#gmaps-pin)">
        <rect x="0" y="0" width="24" height="24" fill="#ea4335" />
        <path d="M0 24 24 0v7L7 24z" fill="#fbbc04" />
        <path d="M0 24 24 6v7L11 24z" fill="#34a853" />
        <path d="M0 0h13L0 13z" fill="#4285f4" />
      </g>
      <circle cx="12" cy="9.2" r="2.5" fill="#fff" />
    </svg>
  );
}
