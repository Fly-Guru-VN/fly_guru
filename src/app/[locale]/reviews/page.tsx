import type { Metadata } from "next";
import Image from "next/image";
import { Container, Section, buttonClasses } from "@/components/ui";
import { Squiggle } from "@/components/Squiggle";
import { HeroStage } from "@/components/HeroStage";
import { Marquee } from "@/components/Marquee";
import { RailItem } from "@/components/Rail";
import { DotsRail } from "@/components/DotsRail";
import { ReviewCard } from "@/components/ReviewCard";
import { ReviewPhotoCard } from "@/components/ReviewPhotoCard";
import { GoogleMapsLink } from "@/components/GoogleMapsLink";
import { BookBtn } from "@/components/BookBtn";
import { TrackedLink } from "@/components/TrackedLink";
import { IconStar, IconArrowRight } from "@/components/icons";
import { reviews } from "@/content/reviews";
import { contacts } from "@/content/contacts";

export const metadata: Metadata = { title: "Отзывы" };
export const dynamic = "force-static"; // статичная страница, форсим SSG

// Страница отзывов собрана тем же языком, что обучение, тандем и клуб: кадр во
// весь экран, бегущая строка, дальше — блоки без лишнего текста.
//
// Порядок продуман как чтение чужого опыта: сначала оценка школы целиком
// (сколько людей и какая средняя), потом три развёрнутых истории с
// фотографиями тех самых занятий, потом одна фраза крупно — та, ради которой
// всё и затевалось, — и только потом остальные отзывы кладкой.

// Оценка школы в Google Maps. Вписана руками: живьём её отдаёт только Places
// API, а он требует привязанной банковской карты, которой у школы нет.
//
// Поэтому цифра здесь округлена ВНИЗ и не устаревает: отзывов со временем
// только прибавляется, и «более 170» останется правдой и через год. Точное,
// всегда свежее число видно ниже на этой же странице — в блоке с настоящей
// карточкой Google, где плашку рисует сам Google.
//
// Проверено 24.08.2026: 4,9 и 176 отзывов. Захотите освежить — правьте эти две
// строки, больше нигде цифра не встречается.
const GOOGLE_RATING = { value: "4,9", count: "более 170 отзывов" };

// Короткие куски настоящих отзывов — для бегущей строки. Только то, что
// человек действительно написал, без придуманных лозунгов.
const QUOTES = [
  "«Полетели с первого раза»",
  "«Дочка была в полном восторге»",
  "«Стоит каждого заплаченного донга»",
  "«Куча впечатлений»",
  "«Непередаваемые эмоции»",
  "«Инструктор всё спокойно объяснял»",
];

// Фраза для крупной врезки. Вырезана из отзыва Полины дословно — врезка не
// пересказывает отзыв, а цитирует его.
const PULL_QUOTE = {
  name: "Полина Черненькая",
  text: "Я уже вернулась в Россию, но до сих пор живу воспоминаниями об этом уроке. Это был один из самых ярких моментов поездки!",
};

export default function ReviewsPage() {
  // С фотографиями — истории целиком, остальные — кладкой ниже.
  const withPhoto = reviews.filter((r) => r.photo);
  const rest = reviews.filter((r) => !r.photo);

  const pull = reviews.find((r) => r.name === PULL_QUOTE.name);

  return (
    <>
      {/* ── Первый экран ── */}
      {/* Кадр ученика, а не инструктора: страница о тех, кто пришёл и поехал. */}
      <HeroStage
        image="/media/photo/training-uchenik.webp"
        alt="Ученик FlyGuru самостоятельно летит на электрофойле у острова в Нячанге"
        bleed
      >
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-white/80 drop-shadow-[0_1px_8px_rgba(0,0,0,0.5)]">
            Отзывы
          </p>
          <h1 className="mt-3 text-4xl font-bold leading-[1.05] drop-shadow-[0_2px_14px_rgba(0,0,0,0.5)] sm:text-5xl md:text-6xl">
            Что говорят
            <br />
            ученики
          </h1>
          <p className="mt-4 max-w-md text-base text-white/90 drop-shadow-[0_1px_8px_rgba(0,0,0,0.5)] sm:text-lg">
            Настоящие отзывы гостей школы — все с карточки FlyGuru в Google
            Maps, ни один не написан нами.
          </p>
        </div>
        <div>
          {/* Оценка плашкой на кадре: цифра и есть главный довод страницы. */}
          <div className="mt-6 inline-flex items-center gap-4 rounded-2xl border border-white/40 bg-white/10 px-5 py-4 backdrop-blur-sm">
            <span className="text-5xl font-bold leading-none">{GOOGLE_RATING.value}</span>
            <span>
              <span className="flex gap-1 text-accent" aria-hidden>
                {Array.from({ length: 5 }).map((_, i) => (
                  <IconStar key={i} className="h-5 w-5" />
                ))}
              </span>
              <span className="mt-1.5 block text-sm font-semibold text-white/90">
                {GOOGLE_RATING.count} в Google Maps
              </span>
            </span>
          </div>
          <div className="mt-5">
            <TrackedLink
              href={contacts.mapLink}
              external
              newTab
              event="contact_click"
              data={{ channel: "maps", place: "reviews-hero" }}
              className={buttonClasses({ variant: "light", size: "lg", className: "w-full sm:w-auto" })}
            >
              Читать в Google Maps
            </TrackedLink>
          </div>
        </div>
      </HeroStage>

      <Marquee items={QUOTES} />

      {/* ── Три истории с фото ── */}
      <Section pad="tight" className="bg-gradient-to-b from-white to-surface-2">
        <Container>
          <h2 className="text-3xl font-bold sm:text-4xl">Как это было</h2>
          <Squiggle long className="mt-4" />
          <p className="mt-5 max-w-2xl text-muted">
            Три отзыва с фотографиями тех самых занятий. Тексты целиком, как они
            написаны в Google.
          </p>

          {/* Лента: на телефоне листается пальцем, на ПК — три колонки. Та же,
              что в блоке отзывов на главной, только текст здесь не обрезаем. */}
          <DotsRail count={withPhoto.length} className="md:grid-cols-3">
            {withPhoto.map((r) => (
              <RailItem key={r.name}>
                <ReviewPhotoCard review={r} clamp={false} />
              </RailItem>
            ))}
          </DotsRail>
        </Container>
      </Section>

      {/* ── Врезка ── */}
      {/* Одна фраза крупно: после трёх длинных карточек глазу нужна пауза, а
          странице — та строчка, которую запомнят. */}
      <Section pad="tight" className="bg-surface-2">
        <Container>
          <figure className="relative mx-auto max-w-3xl px-4 text-center sm:px-10">
            <span
              aria-hidden
              className="pointer-events-none absolute -top-8 left-0 select-none font-serif text-[9rem] leading-none text-primary/10 sm:-top-10 sm:text-[12rem]"
            >
              &ldquo;
            </span>
            <blockquote className="relative text-xl font-bold leading-snug sm:text-2xl md:text-3xl">
              {PULL_QUOTE.text}
            </blockquote>
            <figcaption className="relative mt-6 flex items-center justify-center gap-3">
              {pull?.avatar && (
                <Image
                  src={pull.avatar}
                  alt=""
                  aria-hidden
                  width={96}
                  height={96}
                  className="h-11 w-11 rounded-full object-cover"
                />
              )}
              <span className="text-left">
                <span className="block font-semibold leading-tight">{PULL_QUOTE.name}</span>
                {pull?.sourceUrl && <GoogleMapsLink href={pull.sourceUrl} />}
              </span>
            </figcaption>
          </figure>
        </Container>
      </Section>

      {/* ── Остальные отзывы ── */}
      <Section pad="tight" className="bg-gradient-to-b from-surface-2 to-white">
        <Container>
          <h2 className="text-3xl font-bold sm:text-4xl">Все отзывы</h2>
          <Squiggle long className="mt-4" />

          {/* Кладка (CSS columns), а не сетка: отзывы разной длины, и в сетке
              под короткой карточкой оставалась дыра в полстолбца. В кладке
              карточки идут встык, а порядок чтения сверху вниз по колонке —
              для несвязанных между собой отзывов это нормально. */}
          <div className="mt-8 gap-5 sm:columns-2 lg:columns-3 [&>figure]:mb-5">
            {rest.map((r) => (
              <ReviewCard key={r.name} review={r} />
            ))}
          </div>
        </Container>
      </Section>

      {/* ── Карточка в Google ── */}
      {/* Здесь и живёт всегда свежая цифра: плашку с оценкой и точным числом
          отзывов рисует сам Google внутри карты. Вырезать из неё одну плашку и
          повесить на первый экран нельзя — высота плашки скачет от ширины
          карты, и при 800 px строчка с оценкой уходит за край обрезки (мерил
          24.08.2026). Поэтому карта стоит целиком, как ей и положено. */}
      <Section pad="tight" className="bg-white">
        <Container>
          <h2 className="text-3xl font-bold sm:text-4xl">Карточка школы в Google</h2>
          <Squiggle long className="mt-4" />
          <p className="mt-5 max-w-2xl text-muted">
            Оценку и число отзывов на карте показывает сам Google — там они
            всегда свежие. Нажмите на плашку, чтобы открыть карточку и прочитать
            все отзывы до последнего.
          </p>

          <div className="mt-8 overflow-hidden rounded-3xl border border-line shadow-[0_18px_40px_-30px_rgba(15,34,51,0.5)]">
            <iframe
              title="Карточка FlyGuru в Google Maps — оценка и отзывы"
              src={contacts.mapEmbed}
              className="h-[320px] w-full sm:h-[420px]"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </Container>
      </Section>

      {/* ── Свой отзыв ── */}
      <Section pad="tight" className="bg-gradient-to-b from-white to-surface-2">
        <Container>
          <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-primary-strong px-6 py-10 text-center text-white shadow-[0_24px_50px_-30px_rgba(15,34,51,0.6)] sm:px-10 sm:py-12">
            <span aria-hidden className="mx-auto flex justify-center gap-1 text-accent">
              {Array.from({ length: 5 }).map((_, i) => (
                <IconStar key={i} className="h-6 w-6" />
              ))}
            </span>
            <h2 className="mt-4 text-2xl font-bold sm:text-3xl">Уже катались с нами?</h2>
            <p className="mx-auto mt-3 max-w-xl text-white/90">
              Будем рады вашему отзыву — он откроется прямо в нашей карточке
              Google Maps.
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              {/* Ведём в карточку школы, а не на /contacts: человек дочитал
                  чужие отзывы, и это ровно тот момент, когда пишут свой. Раньше
                  здесь была ссылка на контакты, а оттуда карта вела на Maryna
                  Beach Club — то есть отзыв уходил чужому бизнесу. */}
              <TrackedLink
                href={contacts.mapLink}
                external
                newTab
                event="contact_click"
                data={{ channel: "maps", place: "reviews" }}
                className={buttonClasses({ size: "lg", className: "w-full sm:w-auto" })}
              >
                Оставить отзыв
                <IconArrowRight aria-hidden className="h-4 w-4" />
              </TrackedLink>
              <BookBtn place="reviews-cta" variant="light" size="lg" className="w-full sm:w-auto">
                Записаться
              </BookBtn>
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}
