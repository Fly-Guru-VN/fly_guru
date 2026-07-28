import Image from "next/image";
import { Container, Section, SectionHeading, Button } from "@/components/ui";
import { BookBtn } from "@/components/BookBtn";
import { HeroStage } from "@/components/HeroStage";
import { Marquee } from "@/components/Marquee";
import { Rail, RailItem } from "@/components/Rail";
import { StickyBookBar } from "@/components/StickyBookBar";
import { Faq } from "@/components/Faq";
import { ReviewCard } from "@/components/ReviewCard";
import { StepCard, type Step } from "@/components/StepCard";
import {
  IconTandem,
  IconFoil,
  IconClub,
  IconArrowRight,
  IconClock,
  IconPeople,
  IconShield,
  IconInfinity,
  IconPalm,
  IconStar,
} from "@/components/icons";
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

  const steps: Step[] = [
    {
      icon: IconTandem,
      title: "Тандем",
      meta: "10 минут, без обучения",
      text: "Пробный полёт вдвоём с инструктором, на одном фойле. Просто становитесь и взлетаете, без обучения.",
      image: "/media/photo/step-1-tandem.webp",
      imageMobile: "/media/photo/step-1-tandem-phone.webp",
      facts: [
        { icon: IconClock, label: "10 минут" },
        { icon: IconStar, label: "Идеально", label2: "для старта" },
        { icon: IconPeople, label: "Доступно детям", label2: "от 8 лет" },
      ],
    },
    {
      icon: IconFoil,
      title: "Базовое обучение",
      meta: "учимся летать",
      text: "В течение часа мы с нуля обучаем вас, как управлять фойлом, держать баланс и чувствовать доску. В это время инструктор поддерживает с вами связь с берега.",
      image: "/media/photo/step-2-training.webp",
      imageMobile: "/media/photo/step-2-training-phone.webp",
      facts: [
        { icon: IconClock, label: "60 минут" },
        { icon: IconPeople, label: "На связи", label2: "с инструктором" },
        { icon: IconShield, label: "Безопасно", label2: "и просто" },
      ],
    },
    {
      icon: IconClub,
      title: "Экскурсии и сафари",
      meta: "свободное катание",
      text: "После обучения вы можете отправляться в более длительные путешествия на острова, безлюдные пляжи и удалённые места.",
      image: "/media/photo/step-3-club.webp",
      imageMobile: "/media/photo/step-3-club-phone.webp",
      facts: [
        { icon: IconInfinity, label: "Без", label2: "лимита" },
        { icon: IconPeople, label: "Клуб", label2: "и комьюнити" },
        { icon: IconPalm, label: "Приключения", label2: "и свобода" },
      ],
    },
  ];

  return (
    <>
      {/* ── Первый экран: видео во весь экран ── */}
      {/* Ролик яркий и солнечный, поэтому dim="soft": сильная заливка убивала
          бирюзу воды, ради которой всё и снято. Текст держится на тени. */}
      <HeroStage
        video="/media/video/hero-loop.mp4"
        videoMobile="/media/video/hero-loop-mobile.mp4"
        poster="/media/video/hero-loop-poster.jpg"
        bleed
        dim="soft"
      >
        <h1 className="text-4xl font-bold leading-[1.05] drop-shadow-[0_2px_14px_rgba(0,0,0,0.5)] sm:text-5xl md:text-6xl">
          Научим летать<br />
          за 60 минут
        </h1>
        <p className="mt-4 max-w-md text-base text-white/90 drop-shadow-[0_1px_8px_rgba(0,0,0,0.5)] sm:text-lg">
          Это проще, чем выглядит. Доска уверенно ощущается под ногами, мачта
          рассекает воду — и вы летите.
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
      {/* Фон уходит от белого к бледно-морскому: блок отделяется от видео сверху
          без жёсткой линии, как рассвет над водой на самих иллюстрациях. */}
      <Section id="path" className="bg-gradient-to-b from-white to-surface-2">
        <Container>
          <SectionHeading
            eyebrow="С чего начать"
            title="Как встать на доску?"
          />
          {/* Волна-разделитель под подзаголовком — как в макете: маленький
              росчерк воды вместо жирной линии. */}
          <svg
            aria-hidden
            viewBox="0 0 64 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="mt-5 h-2.5 w-16 text-primary/50"
          >
            <path d="M2 6c4-5 8-5 12 0s8 5 12 0 8-5 12 0 8 5 12 0" />
          </svg>
          {/* Телефон — карточки одна под другой, ПК — три в ряд. Каждая закрытая
              карточка вместо прежней «дорожки»: у шага появились иллюстрация и
              факты, а они требуют своей рамки, иначе всё сливается в кашу. */}
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {steps.map((s, i) => (
              <StepCard key={s.title} step={s} index={i} />
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
