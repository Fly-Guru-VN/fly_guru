import type { Metadata } from "next";
import Image from "next/image";
import { localeAlternates } from "@/lib/alternates";
import { Container, Section, SectionHeading, Button, buttonClasses } from "@/components/ui";
import { TrackedLink } from "@/components/TrackedLink";
import { JsonLd } from "@/components/JsonLd";
import { businessSchema, priceRangeLabel } from "@/lib/schema";
import { getSiteServices } from "@/lib/services";
import { BookBtn } from "@/components/BookBtn";
import { HeroStage } from "@/components/HeroStage";
import { Marquee } from "@/components/Marquee";
import { RailItem } from "@/components/Rail";
import { DotsRail } from "@/components/DotsRail";
import { Faq } from "@/components/Faq";
import { ReviewPhotoCard } from "@/components/ReviewPhotoCard";
import { StepCard, type Step } from "@/components/StepCard";
import { FoilVideo } from "@/components/FoilVideo";
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
  IconWrench,
  IconBadgeCheck,
} from "@/components/icons";
import { buildFaq, homeFaqKeys } from "@/content/faq";
import { homeReviewIds, localizeReviews, pickReview, reviews } from "@/content/reviews";
import { getTranslations, setRequestLocale } from "next-intl/server";

// Заголовок и описание у главной свои не нужны — их даёт layout. А вот
// hreflang нужен именно здесь: в layout он достался бы по наследству всем
// страницам сайта разом и увёл бы их переводы на главную.
export const metadata: Metadata = {
  alternates: localeAlternates("/"),
};

// Страница полностью статична — форсим SSG. В Next 16 классификация
// static/dynamic для страниц с next-intl Link нестабильна; директива это фиксирует.
export const dynamic = "force-static";

// Главная собрана под телефон: экран узкий, палец один, терпения мало.
// Порядок блоков — как разговор с человеком на пляже: сначала показать полёт
// (видео), потом коротко факты, потом чужой опыт (отзывы), потом путь «с чего
// начать», потом ответы на страхи (вопросы) и только в конце — магазин.
export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, tCommon, tSchema, tFaq, tReviewTexts] = await Promise.all([
    getTranslations("Home"),
    getTranslations("Common"),
    getTranslations("Schema"),
    getTranslations("Faq.home"),
    getTranslations("ReviewTexts"),
  ]);

  // Только ради вилки цен в разметке для поисковика. Страница статичная, так
  // что запрос уходит один раз при сборке, а не на каждого посетителя.
  const priceRange = priceRangeLabel(await getSiteServices());

  // Тройка отзывов с фотографиями — на языке гостя.
  const localizedReviews = localizeReviews(reviews, tReviewTexts);
  const homeReviews = homeReviewIds.map((id) => pickReview(localizedReviews, id));

  const facts = [
    t("facts.success"),
    t("facts.tandem"),
    t("facts.place"),
    t("facts.kids"),
    t("facts.instructor"),
  ];

  // Три обещания под видео сборки — тем же строем, что факты в карточках шагов.
  const shopFacts = [
    { icon: IconShield, label: t("shopFacts.brands") },
    { icon: IconWrench, label: t("shopFacts.service") },
    { icon: IconBadgeCheck, label: t("shopFacts.warranty") },
  ];

  const steps: Step[] = [
    {
      icon: IconTandem,
      title: t("steps.tandemTitle"),
      meta: t("steps.tandemMeta"),
      text: t("steps.tandemText"),
      image: "/media/photo/step-1-tandem.webp",
      imageMobile: "/media/photo/step-1-tandem-phone.webp",
      facts: [
        { icon: IconClock, label: t("steps.tandemFact1") },
        { icon: IconStar, label: t("steps.tandemFact2"), label2: t("steps.tandemFact2b") },
        { icon: IconPeople, label: t("steps.tandemFact3"), label2: t("steps.tandemFact3b") },
      ],
    },
    {
      icon: IconFoil,
      title: t("steps.trainingTitle"),
      meta: t("steps.trainingMeta"),
      text: t("steps.trainingText"),
      image: "/media/photo/step-2-training.webp",
      imageMobile: "/media/photo/step-2-training-phone.webp",
      facts: [
        { icon: IconClock, label: t("steps.trainingFact1") },
        { icon: IconPeople, label: t("steps.trainingFact2"), label2: t("steps.trainingFact2b") },
        { icon: IconShield, label: t("steps.trainingFact3"), label2: t("steps.trainingFact3b") },
      ],
    },
    {
      icon: IconClub,
      title: t("steps.clubTitle"),
      meta: t("steps.clubMeta"),
      text: t("steps.clubText"),
      image: "/media/photo/step-3-club.webp",
      imageMobile: "/media/photo/step-3-club-phone-2.webp",
      facts: [
        { icon: IconInfinity, label: t("steps.clubFact1"), label2: t("steps.clubFact1b") },
        { icon: IconPeople, label: t("steps.clubFact2"), label2: t("steps.clubFact2b") },
        { icon: IconPalm, label: t("steps.clubFact3"), label2: t("steps.clubFact3b") },
      ],
    },
  ];

  return (
    <>
      {/* Карточка школы для поисковиков: адрес, телефон, часы, координаты.
          Стоит на главной — это страница, которая и представляет саму школу. */}
      <JsonLd data={businessSchema(tSchema("description"), priceRange)} />

      {/* ── Первый экран: видео во весь экран ── */}
      {/* Ролик яркий и солнечный, поэтому dim="soft": сильная заливка убивала
          бирюзу воды, ради которой всё и снято. Текст держится на тени. */}
      <HeroStage
        video="/media/video/hero-loop.mp4"
        videoMobile="/media/video/hero-loop-mobile.mp4"
        poster="/media/video/hero-loop-poster.jpg"
        bleed
        dim="soft"
        split
      >
        {/* Весь текст — одним блоком наверху: на телефоне HeroStage уводит
            первого потомка в небо над фойлом, а второго оставляет внизу. Абзац
            раньше жил внизу с кнопками и налезал на доску. На ПК блоки просто
            идут подряд, вид тот же. */}
        <div>
          <h1 className="text-4xl font-bold leading-[1.05] drop-shadow-[0_2px_14px_rgba(0,0,0,0.5)] sm:text-5xl md:text-6xl">
            {t("titleLine1")}
            <br />
            {t("titleLine2")}
          </h1>
          <p className="mt-4 max-w-md text-base text-white/90 drop-shadow-[0_1px_8px_rgba(0,0,0,0.5)] sm:text-lg">
            {t("lead")}
          </p>
        </div>
        <div>
          <div className="flex flex-col gap-3 sm:flex-row md:mt-7">
            <BookBtn place="hero" size="lg" className="w-full sm:w-auto">
              {tCommon("book")}
            </BookBtn>
            <Button href="/tandem" size="lg" variant="light" className="w-full sm:w-auto">
              {t("tryTandem")}
            </Button>
          </div>
          {/* Подсказка листать: на полноэкранном кадре без неё не всем очевидно,
              что под ним есть страница. На ПК не нужна — там кадр не во весь
              экран и следующий блок виден сразу. */}
          <div
            aria-hidden
            className="animate-scroll-hint mt-8 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/70 md:hidden"
          >
            <span>{t("swipe")}</span>
            <span className="text-base leading-none">↓</span>
          </div>
        </div>
      </HeroStage>

      <Marquee items={facts} />

      {/* ── Отзывы ── */}
      {/* Отзывы идут сразу после первого экрана, до «Как встать на доску?»:
          сначала чужой опыт, потом уже наши шаги.
          Фон и чайки по макету: секция «дышит» морем, но декор чисто
          декоративный — на телефоне он только съедал бы место, поэтому от md. */}
      <Section
        tone="muted"
        pad="tight"
        className="relative overflow-hidden bg-gradient-to-b from-white to-surface-2"
      >
        <div aria-hidden className="pointer-events-none absolute inset-0 hidden md:block">
          <Image
            src="/media/decor/bird.webp"
            alt=""
            width={320}
            height={117}
            className="absolute right-12 top-16 w-16 -rotate-6"
          />
          <Image
            src="/media/decor/bird.webp"
            alt=""
            width={320}
            height={117}
            className="absolute right-24 top-40 w-[4.5rem] rotate-[7deg]"
          />
        </div>
        <Container className="relative">
          <div className="flex items-end justify-between gap-4">
            <SectionHeading eyebrow={t("reviewsEyebrow")} title={t("reviewsTitle")} />
            {/* Прячем обёрткой, а не классом hidden на самой кнопке: у Button в
                базовых классах уже есть inline-flex, и в собранном CSS он идёт
                позже hidden — на телефоне ссылка вылезала рядом с заголовком. */}
            <div className="hidden shrink-0 sm:block">
              <Button href="/reviews" variant="ghost">
                {t("allReviews")} <IconArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {/* Лента: на телефоне листается пальцем, на ПК — три колонки.
              Раньше три отзыва подряд занимали полтора экрана. */}
          <DotsRail count={homeReviews.length} className="md:grid-cols-3">
            {homeReviews.map((r) => (
              <RailItem key={r.id}>
                <ReviewPhotoCard review={r} />
              </RailItem>
            ))}
          </DotsRail>
          <div className="mt-6 sm:hidden">
            <Button href="/reviews" variant="secondary">
              {t("allReviews")} <IconArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </Container>
      </Section>

      {/* ── Путь клиента ── */}
      {/* Фон продолжает предыдущий блок: отзывы заканчиваются бледно-морским,
          шаги с него начинаются и уходят обратно в белый — к вопросам ниже.
          Между блоками нет жёстких линий, как рассвет над водой на самих
          иллюстрациях. */}
      <Section
        id="path"
        pad="tight"
        className="relative overflow-hidden bg-gradient-to-b from-surface-2 to-white"
      >
        {/* Те же чайки, что в отзывах, но в другом месте и в другую сторону: там
            пара висит справа столбиком и летит влево-вниз, здесь — заходит
            горизонтально над карточками, в пустоте справа от заголовка.
            Как и там, только от md: на телефоне декор съедал бы место. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 hidden md:block">
          <Image
            src="/media/decor/bird.webp"
            alt=""
            width={320}
            height={117}
            className="absolute right-40 top-12 w-12 -scale-x-100 -rotate-[9deg] opacity-90"
          />
          <Image
            src="/media/decor/bird.webp"
            alt=""
            width={320}
            height={117}
            className="absolute right-10 top-24 w-[4.5rem] -scale-x-100 rotate-[5deg]"
          />
        </div>
        <Container className="relative">
          <SectionHeading
            eyebrow={t("stepsEyebrow")}
            title={t("stepsTitle")}
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
          {/* Телефон — лента с точками, как у отзывов: три высокие карточки
              одна под другой занимали почти три экрана прокрутки вслепую.
              ПК — три в ряд. Каждая закрытая карточка вместо прежней
              «дорожки»: у шага появились иллюстрация и факты, а они требуют
              своей рамки, иначе всё сливается в кашу. */}
          <DotsRail as="ol" count={steps.length} className="md:grid-cols-3">
            {steps.map((s, i) => (
              <RailItem as="li" key={s.title}>
                <StepCard step={s} index={i} />
              </RailItem>
            ))}
          </DotsRail>
          <div className="mt-6 md:mt-8">
            <Button href="/training" variant="secondary">
              {t("moreTraining")} <IconArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </Container>
      </Section>

      {/* ── Магазин и вопросы ── */}
      {/* Один блок вместо двух. Раньше это были две отдельные секции с разным
          фоном (вопросы на фоне страницы, магазин на surface-2) — на стыке с
          шагами получалась заметная ступенька цвета. Теперь секция начинается
          ровно тем белым, которым закончились шаги, и сама уходит в морской. */}
      <Section pad="tight" className="relative overflow-hidden bg-gradient-to-b from-white to-surface-2">
        {/* Чайки — как в отзывах и шагах, только от md. Пара летит в пустоте
            справа, под карточкой с видео. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 hidden md:block">
          <Image
            src="/media/decor/bird.webp"
            alt=""
            width={320}
            height={117}
            className="absolute bottom-24 right-24 w-14 -rotate-[7deg] opacity-90"
          />
          <Image
            src="/media/decor/bird.webp"
            alt=""
            width={320}
            height={117}
            className="absolute bottom-10 right-44 w-[4.5rem] rotate-[5deg]"
          />
        </div>
        <Container className="relative">
          {/* Плашка магазина. Фото очень светлое и широкое (3:1), поэтому:
              • на телефоне оно лежит полосой сверху, а текст идёт под ним по
                белому — в узкий кадр текст поверх фото просто не влезал. Кадр
                сдвинут вправо (object-position 70%), чтобы доска встала по
                центру полосы: сама она сидит примерно на 58% ширины снимка, а
                при object-cover окно кадра ходит только в пределах остатка;
              • от sm фото заливает плашку целиком, текст ложится слева поверх
                воды, как в макете. БЕЗ белой вуали: слева и так почти белая
                вода, а вуаль читалась как пелена поверх фотографии. Текст
                тёмный — заливать светлое фото чёрным градиентом ради белых букв
                значит убить сам кадр. */}
          <div className="relative isolate overflow-hidden rounded-3xl bg-surface shadow-[0_18px_40px_-28px_rgba(15,34,51,0.45)] sm:h-[340px]">
            <div className="relative h-48 sm:absolute sm:inset-0 sm:-z-10 sm:h-auto">
              <Image
                src="/media/photo/shop-hero.webp"
                alt={t("shopAlt")}
                fill
                sizes="(min-width: 1024px) 1024px, 100vw"
                quality={90}
                className="object-cover object-[70%_50%] sm:object-center"
              />
            </div>
            <div className="p-6 sm:flex sm:h-full sm:max-w-[52%] sm:flex-col sm:justify-center sm:p-10">
              <p className="text-sm font-semibold uppercase tracking-wide text-primary">
                {t("shopEyebrow")}
              </p>
              <h2 className="mt-2 text-2xl font-bold sm:text-3xl">{t("shopTitle")}</h2>
              <p className="mt-3 text-muted">
                {t("shopText")}
              </p>
              <div className="mt-6">
                {/* Через TrackedLink, а не обычный Button: переход в магазин
                    считаем отдельно — по нему видно, есть ли вообще спрос на
                    продажу фойлов с главной. Вид тот же, классы кнопки берём
                    из общего buttonClasses. */}
                <TrackedLink
                  href="/shop"
                  event="shop_click"
                  data={{ place: "home" }}
                  className={buttonClasses({ variant: "sea" })}
                >
                  {t("shopButton")} <IconArrowRight className="h-4 w-4" />
                </TrackedLink>
              </div>
            </div>
          </div>

          {/* Низ блока: слева вопросы, справа карточка с видео сборки.
              На ТЕЛЕФОНЕ видео идёт ПЕРВЫМ, до вопросов: длинный список ответов
              на узком экране отодвигал его так далеко вниз, что до ролика почти
              никто не доезжал. Порядок меняем через order — в разметке карточка
              остаётся второй, чтобы на ПК не пришлось раскладывать колонки
              задом наперёд. */}
          <div className="mt-6 grid items-start gap-6 lg:mt-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
            <div className="order-2 lg:order-none">
              <Faq items={buildFaq(homeFaqKeys, tFaq)} heading={t("faqHeading")} />
            </div>
            <div className="order-1 overflow-hidden rounded-3xl border border-line bg-surface p-4 shadow-[0_18px_40px_-28px_rgba(15,34,51,0.45)] lg:order-none">
              <FoilVideo
                src="/media/video/foil-build.mp4"
                poster="/media/video/foil-build-poster.jpg"
                alt={t("assemblyAlt")}
              />
              {/* Без подписи тёмный технический ролик висит в карточке без
                  объяснения — непонятно ни что это, ни что его можно открыть. */}
              <div className="px-2 pt-4">
                <h3 className="text-lg font-bold">{t("assemblyTitle")}</h3>
                <p className="mt-1.5 text-sm text-muted">
                  {t("assemblyText")}
                </p>
              </div>
              <div className="mt-4 grid grid-cols-3 border-t border-line pt-4">
                {shopFacts.map((f, i) => (
                  <div
                    key={f.label}
                    className={`flex flex-col items-center justify-start gap-1.5 px-1.5 text-center ${
                      i > 0 ? "border-l border-line" : ""
                    }`}
                  >
                    <f.icon aria-hidden className="h-5 w-5 shrink-0 text-primary" />
                    <span className="text-[11px] font-semibold leading-tight text-ink/85 sm:text-xs">
                      {f.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Container>
      </Section>

    </>
  );
}
