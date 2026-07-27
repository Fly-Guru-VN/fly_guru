import Image from "next/image";
import { Container, Section, SectionHeading, Button } from "@/components/ui";
import { BookBtn } from "@/components/BookBtn";
import { HeroStage } from "@/components/HeroStage";
import { Marquee } from "@/components/Marquee";
import { Rail, RailItem } from "@/components/Rail";
import { StickyBookBar } from "@/components/StickyBookBar";
import { Faq } from "@/components/Faq";
import { ReviewCard } from "@/components/ReviewCard";
import { IconTandem, IconFoil, IconClub, IconArrowRight } from "@/components/icons";
import { homeFaq } from "@/content/faq";
import { reviews } from "@/content/reviews";

// Страница полностью статична — форсим SSG. В Next 16 классификация
// static/dynamic для страниц с next-intl Link нестабильна; директива это фиксирует.
export const dynamic = "force-static";

// Главная собрана под телефон: экран узкий, палец один, терпения мало.
// Порядок блоков — как разговор с человеком на пляже: сначала показать полёт
// (видео), потом коротко факты, потом путь «с чего начать», потом чужой опыт
// (отзывы), потом ответы на страхи (вопросы) и только в конце — магазин.
export default function HomePage() {
  const facts = [
    "90% встают на крыло на первом занятии",
    "Тандем — 10 минут",
    "Нячанг · Marina Beach",
    "Дети с 8 лет",
    "Инструктор рядом на воде",
  ];

  const steps = [
    {
      icon: IconTandem,
      title: "Тандем",
      meta: "10 минут · без обязательств",
      text: "Пробный полёт вдвоём с инструктором. Просто попробовать, как это — лететь над водой.",
    },
    {
      icon: IconFoil,
      title: "Базовое обучение",
      meta: "обычно 3–5 занятий",
      text: "Встаёте на крыло сами. Доска подбирается под ваш вес, инструктор всё время рядом.",
    },
    {
      icon: IconClub,
      title: "Абонемент и клуб",
      meta: "дальше — сами",
      text: "Катаетесь по абонементу, ездите с клубом на экскурсии и сафари по островам.",
    },
  ];

  return (
    <>
      {/* ── Первый экран: видео во весь экран ── */}
      <HeroStage video="/media/video/hero-loop.mp4" poster="/media/video/hero-loop-poster.jpg">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/80">
          Электрофойл-школа в Нячанге
        </p>
        <h1 className="mt-3 text-4xl font-bold leading-[1.05] drop-shadow-sm sm:text-5xl md:text-6xl">
          Полёт над водой —<br />
          уже с первого занятия
        </h1>
        <p className="mt-4 max-w-md text-base text-white/85 sm:text-lg">
          Доска поднимается над волной, шума нет, инструктор рядом. Это проще,
          чем выглядит.
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <BookBtn size="lg" className="w-full sm:w-auto">
            Записаться
          </BookBtn>
          <Button href="/tandem" size="lg" variant="light" className="w-full sm:w-auto">
            Сначала попробовать тандем
          </Button>
        </div>
        {/* Подсказка листать: на полноэкранном кадре без неё не всем очевидно,
            что под ним есть страница. На ПК не нужна — там кадр не во весь
            экран и следующий блок виден сразу. */}
        <div
          aria-hidden
          className="animate-scroll-hint mt-8 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/70 md:hidden"
        >
          <span>Листайте</span>
          <span className="text-base leading-none">↓</span>
        </div>
      </HeroStage>

      <Marquee items={facts} />

      {/* ── Путь клиента ── */}
      <Section>
        <Container>
          <SectionHeading
            eyebrow="С чего начать"
            title="Путь от первого полёта до клуба"
          />
          {/* Телефон — дорожка сверху вниз: номер, линия, шаг. Так видно, что
              это последовательность, а не три отдельные услуги. ПК — три
              колонки, там сравнение рядом читается лучше. */}
          <ol className="mt-8 md:grid md:grid-cols-3 md:gap-6">
            {steps.map((s, i) => (
              <li key={s.title} className="relative pb-8 pl-16 last:pb-0 md:p-0">
                {i < steps.length - 1 && (
                  <span
                    aria-hidden
                    className="absolute bottom-0 left-[1.4rem] top-12 w-px bg-line md:hidden"
                  />
                )}
                <span
                  aria-hidden
                  className="absolute left-0 top-0 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary md:static md:mb-4 md:flex"
                >
                  <s.icon className="h-6 w-6" />
                </span>
                <p className="text-xs font-semibold uppercase tracking-wide text-accent-strong">
                  Шаг {i + 1} · {s.meta}
                </p>
                <h3 className="mt-1 text-xl font-bold">{s.title}</h3>
                <p className="mt-2 text-muted">{s.text}</p>
              </li>
            ))}
          </ol>
          <div className="mt-6 md:mt-8">
            <Button href="/training" variant="secondary">
              Подробнее об обучении <IconArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </Container>
      </Section>

      {/* ── Отзывы ── */}
      <Section tone="muted">
        <Container>
          <div className="flex items-end justify-between gap-4">
            <SectionHeading eyebrow="Отзывы" title="Что говорят ученики" />
            <Button href="/reviews" variant="ghost" className="hidden sm:inline-flex">
              Все отзывы <IconArrowRight className="h-4 w-4" />
            </Button>
          </div>
          {/* Лента: на телефоне листается пальцем, на ПК — три колонки.
              Раньше три отзыва подряд занимали полтора экрана. */}
          <Rail className="mt-8 md:grid-cols-3">
            {reviews.slice(0, 3).map((r, i) => (
              <RailItem key={i}>
                <ReviewCard review={r} clamp />
              </RailItem>
            ))}
          </Rail>
          <div className="mt-6 sm:hidden">
            <Button href="/reviews" variant="secondary">
              Все отзывы <IconArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </Container>
      </Section>

      {/* ── FAQ ── */}
      <Section>
        <Container>
          <SectionHeading eyebrow="Частые вопросы" title="Коротко о главном" />
          <div className="mt-8">
            <Faq items={homeFaq} />
          </div>
        </Container>
      </Section>

      {/* ── Тизер магазина ── */}
      <Section tone="muted">
        <Container>
          {/* Фото фоном, текст поверх — блок стал вдвое компактнее прежнего,
              где картинка и текст стояли рядом и занимали пол-экрана каждый.
              next/image здесь напрямую (а не через Media): нужна своя высота на
              телефоне и на ПК, а Media задаёт пропорции кадра. */}
          <div className="relative isolate h-[340px] overflow-hidden rounded-3xl sm:h-[300px]">
            <Image
              src="/media/photo/shop-foil.webp"
              alt="Электрофойл FlyGuru на пляже в Нячанге"
              fill
              sizes="(min-width: 1024px) 1024px, 100vw"
              quality={90}
              className="-z-10 object-cover"
            />
            <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/50 to-black/10 sm:bg-gradient-to-r sm:from-black/85 sm:via-black/55 sm:to-transparent" />
            <div className="flex h-full flex-col justify-end p-6 text-white sm:max-w-md sm:justify-center sm:p-10">
              <h2 className="text-2xl font-bold sm:text-3xl">Продаём электрофойлы</h2>
              <p className="mt-3 text-white/85">
                Официально возим Hobbywing и Lift Foils. Поможем выбрать под ваш
                вес и уровень, расскажем про обслуживание.
              </p>
              <div className="mt-6">
                <Button href="/shop" variant="light">
                  Смотреть магазин
                </Button>
              </div>
            </div>
          </div>
        </Container>
      </Section>

      <StickyBookBar />
    </>
  );
}
