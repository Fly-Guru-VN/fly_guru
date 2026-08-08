import type { Metadata } from "next";
import { Container, Section, SectionHeading, buttonClasses } from "@/components/ui";
import { ReviewCard } from "@/components/ReviewCard";
import { Media } from "@/components/Media";
import { TrackedLink } from "@/components/TrackedLink";
import { reviews } from "@/content/reviews";
import { contacts } from "@/content/contacts";

export const metadata: Metadata = { title: "Отзывы" };
export const dynamic = "force-static"; // статичная страница, форсим SSG

export default function ReviewsPage() {
  return (
    <Section className="pt-10 sm:pt-14">
      <Container>
        <SectionHeading
          eyebrow="Отзывы"
          title="Что говорят наши ученики"
          subtitle="Реальные отзывы с Google Maps — от тех, кто уже летает с FlyGuru."
        />
        <Media
          src="/media/photo/poza-guru.webp"
          alt="Инструктор FlyGuru летит над водой на электрофойле"
          ratio="21/9"
          className="mt-8"
          priority
        />
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {reviews.map((r, i) => (
            <ReviewCard key={i} review={r} />
          ))}
        </div>

        <div className="mt-12 rounded-3xl border border-line bg-surface-2 p-8 text-center">
          <h2 className="text-xl font-bold">Уже катались с нами?</h2>
          <p className="mt-2 text-muted">
            Будем рады вашему отзыву — он откроется прямо в нашей карточке
            Google Maps.
          </p>
          {/* Ведём в карточку школы, а не на /contacts: человек дочитал чужие
              отзывы, и это ровно тот момент, когда пишут свой. Раньше здесь
              была ссылка на контакты, а оттуда карта вела на Maryna Beach Club
              — то есть отзыв уходил чужому бизнесу. */}
          <div className="mt-5 flex justify-center">
            <TrackedLink
              href={contacts.mapLink}
              external
              newTab
              event="contact_click"
              data={{ channel: "maps", place: "reviews" }}
              className={buttonClasses()}
            >
              Оставить отзыв
            </TrackedLink>
          </div>
        </div>
      </Container>
    </Section>
  );
}
