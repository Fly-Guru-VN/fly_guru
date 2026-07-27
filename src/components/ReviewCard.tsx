import { Card } from "./ui";
import { IconStar } from "./icons";
import type { Review } from "@/content/reviews";

// clamp — для ленты отзывов на главной: там карточки листают пальцем, и полный
// текст на пол-экрана мешает. Целиком отзывы читаются на /reviews.
export function ReviewCard({ review, clamp = false }: { review: Review; clamp?: boolean }) {
  return (
    <Card className="flex h-full flex-col">
      <div className="flex gap-0.5 text-accent" aria-label={`Оценка ${review.rating} из 5`}>
        {Array.from({ length: review.rating }).map((_, i) => (
          <IconStar key={i} className="h-4 w-4" />
        ))}
      </div>
      <p className={`mt-3 flex-1 text-ink ${clamp ? "line-clamp-[9]" : ""}`}>{review.text}</p>
      <p className="mt-4 text-sm font-semibold">
        {review.name}
        {review.role && <span className="font-normal text-muted"> · {review.role}</span>}
      </p>
      {review.sourceUrl && (
        <a
          href={review.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 text-xs text-primary hover:text-primary-strong"
        >
          Отзыв в Google Maps
        </a>
      )}
    </Card>
  );
}
