import type { Metadata } from "next";
import { localeAlternates } from "@/lib/alternates";
import Image from "next/image";
import { Container, Section } from "@/components/ui";
import { HeroStage } from "@/components/HeroStage";
import { Marquee } from "@/components/Marquee";
import { Rail, RailItem } from "@/components/Rail";
import { FormatCard, type Format } from "@/components/FormatCard";
import { TrainingSteps, type TrainingStep } from "@/components/TrainingSteps";
import { WatchVideoBtn } from "@/components/WatchVideoBtn";
import {
  IconCheck,
  IconVest,
  IconSmile,
  IconUser,
  IconPeople,
  IconShield,
  IconSliders,
  IconTrend,
} from "@/components/icons";
import { BookBtn } from "@/components/BookBtn";
import { getActiveServices, getSiteServices, pickService } from "@/lib/services";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { localizeServices } from "@/lib/serviceText";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Training" });

  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: localeAlternates(locale, "/training"),
  };
}
export const dynamic = "force-static"; // статичная страница, форсим SSG

// Кнопка «Смотреть видео» у заголовка ищет ролик по этому id.
const VIDEO_ID = "lesson-video";

// Страница обучения собрана под телефон, как и главная: сначала кадр во весь
// экран, дальше — только то, что человек реально спрашивает перед записью:
// что входит, сколько стоит и что со мной будет происходить на воде.
export default async function TrainingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, tServices] = await Promise.all([
    getTranslations("Training"),
    getTranslations("Services"),
  ]);

  // Услуги обучения из базы (с настоящими id) — для выпадающего списка в
  // форме; цены карточек — тоже из базы (правятся в админке, /admin/services).
  const [services, siteRaw] = await Promise.all([
    getActiveServices("training"),
    getSiteServices(),
  ]);
  // Названия и описания услуг — на языке гостя (справочник хранит только цены).
  const site = localizeServices(siteRaw, tServices);
  // Заранее выбираем «взрослый базовый» — самый популярный вариант.
  const defaultServiceId = services.find((s) => s.code === "basic-adult")?.id;

  // Условия занятия — плашками прямо на кадре: их ищут глазами первыми.
  const facts = [t("facts.duration"), t("facts.age"), t("facts.weight")];

  // Бегущая строка под первым экраном — та же, что на главной, но факты свои.
  // Сюда же ушло то, что раньше висело отдельным блоком с галочками
  // («снаряжение включено», «инструктор на связи»): три строки текста занимали
  // целый экран ради того, что и так повторяется в карточках форматов.
  const marquee = [
    t("marquee.gear"),
    t("marquee.instructor"),
    t("marquee.success"),
    t("marquee.bay"),
    t("marquee.kids"),
  ];

  // Услугу в базе ищем ПО КОДУ: он же id услуги в справочнике сайта (связь
  // задана в getSiteServices). По названию искать нельзя — они переводятся.
  const dbId = (code: string) => services.find((x) => x.code === code)?.id ?? defaultServiceId;

  const formats: Format[] = [
    {
      service: pickService(site, "basic-adult"),
      desc: tServices("basic-adult.blurb"),
      image: "/media/photo/format-solo.webp",
      unoptimized: true,
      highlight: true,
      facts: [
        { icon: IconVest, label: t("formatFacts.gear") },
        { icon: IconUser, label: t("formatFacts.instructor") },
        { icon: IconShield, label: t("formatFacts.safe") },
      ],
    },
    {
      service: pickService(site, "basic-kid"),
      desc: tServices("basic-kid.blurb"),
      image: "/media/photo/format-kid.webp",
      facts: [
        { icon: IconVest, label: t("formatFacts.gear") },
        { icon: IconSmile, label: t("formatFacts.kids") },
        { icon: IconShield, label: t("formatFacts.safe") },
      ],
    },
    {
      service: pickService(site, "individual-training"),
      desc: tServices("individual-training.blurb"),
      image: "/media/photo/format-solo.webp",
      unoptimized: true,
      facts: [
        { icon: IconUser, label: t("formatFacts.oneOnOne") },
        { icon: IconSliders, label: t("formatFacts.personal") },
        { icon: IconTrend, label: t("formatFacts.progress") },
      ],
    },
    {
      service: pickService(site, "basic-duo"),
      desc: tServices("basic-duo.blurb"),
      image: "/media/photo/format-duo.webp",
      facts: [
        { icon: IconPeople, label: t("formatFacts.duo") },
        { icon: IconUser, label: t("formatFacts.instructor") },
        { icon: IconShield, label: t("formatFacts.safe") },
      ],
    },
  ].map((f) => ({ ...f, serviceId: dbId(f.service.id) }));

  // Что происходит на занятии по шагам. Человеку страшно не «обучение», а
  // неизвестность: сразу ли ставят на доску, что будет, если упаду.
  const steps: TrainingStep[] = [
    {
      meta: t("steps.briefingMeta"),
      title: t("steps.briefingTitle"),
      text: t("steps.briefingText"),
      image: "/media/photo/training-step-1.webp",
    },
    {
      meta: t("steps.lyingMeta"),
      title: t("steps.lyingTitle"),
      text: t("steps.lyingText"),
      image: "/media/photo/training-step-2.webp",
    },
    {
      meta: t("steps.balanceMeta"),
      title: t("steps.balanceTitle"),
      text: t("steps.balanceText"),
      image: "/media/photo/training-step-3.webp",
    },
    {
      meta: t("steps.flightMeta"),
      title: t("steps.flightTitle"),
      text: t("steps.flightText"),
      image: "/media/photo/training-step-4.webp",
      // Последний шаг — ради него всё занятие и затевалось: метка оранжевая и
      // со свечением, как в макете.
      highlight: true,
    },
  ];

  return (
    <>
      {/* ── Первый экран ── */}
      {/* Кадр во весь экран и вплотную к шапке, как видео на главной: продаёт
          сама картинка полёта, а не текст над ней. Без split: весь текст лежит
          внизу кадра и на телефоне, и на ПК — на этом снимке верх занимают небо
          и горы, и разводить заголовок с кнопкой по краям тут нечего. */}
      <HeroStage
        image="/media/photo/training-hero-3.webp"
        alt={t("heroAlt")}
        bleed
      >
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
          {/* Сухие условия: раньше лежали списком под текстом и терялись. */}
          <ul className="mt-6 flex flex-wrap gap-2">
            {facts.map((f) => (
              <li
                key={f}
                className="rounded-full border border-white/40 bg-white/10 px-3 py-1.5 text-sm font-semibold backdrop-blur-sm"
              >
                {f}
              </li>
            ))}
          </ul>
          <div className="mt-5">
            <BookBtn
              serviceId={defaultServiceId}
              place="training-hero"
              size="lg"
              className="w-full sm:w-auto"
            >
              {t("book")}
            </BookBtn>
          </div>
        </div>
      </HeroStage>

      <Marquee items={marquee} />

      {/* ── Форматы ── */}
      {/* Без заголовка секции: карточки и так подписаны, а «Форматы. Выберите
          вариант» отодвигало сами варианты на пол-экрана вниз. */}
      {/* Фон у всех секций страницы общий — чередования плашками нет: страница
          читается одним полотном, а не набором блоков.
          Верхнее поле маленькое: над карточками уже есть свой поясок под метку
          «Популярное» (pt-10 в FormatCard), и обычный отступ секции складывался
          бы с ним в пустую полосу. */}
      <Section pad="tight" className="pt-0 sm:pt-2">
        <Container>
          {/* На планшете 2 в ряд, а не 4: при 768 px четыре карточки давали
              плашку факта шириной 53 px — подписи в неё просто не влезали. */}
          <Rail className="md:grid-cols-2 lg:grid-cols-4">
            {formats.map((f) => (
              <RailItem key={f.service.id}>
                <FormatCard format={f} />
              </RailItem>
            ))}
          </Rail>

          {/* Что входит в цену — один раз под всеми карточками, как в макете.
              Раньше эти пункты повторялись в каждой карточке и раздували их.
              Плашка нарочно легче карточек: узкая, прижата к ним вплотную и с
              еле заметным градиентом вместо ровной заливки — читается как
              приписка к ряду, а не как пятая карточка. */}
          <div className="mt-3 rounded-2xl border border-line bg-gradient-to-b from-white to-surface-2 px-4 py-2.5">
            <div className="flex flex-col gap-2 text-[13px] sm:flex-row sm:items-center sm:justify-center sm:gap-6">
              <p className="flex items-start gap-2 sm:items-center">
                <IconCheck aria-hidden className="mt-px h-4 w-4 shrink-0 text-primary sm:mt-0" />
                <span>
                  <span className="font-semibold">{t("included")}</span>{" "}
                  {t("includedList")}
                </span>
              </p>
              <span aria-hidden className="hidden h-5 w-px shrink-0 bg-line sm:block" />
              <p className="flex items-start gap-2 sm:items-center">
                <IconShield aria-hidden className="mt-px h-4 w-4 shrink-0 text-primary sm:mt-0" />
                <span>{t("safeBay")}</span>
              </p>
            </div>
          </div>
        </Container>
      </Section>

      {/* ── Как проходит занятие ── */}
      <Section pad="tight" className="relative overflow-hidden">
        {/* Чайки — как в блоках главной: только от md, на телефоне декор
            съедал бы место. Пара сидит в пустоте справа от заголовка, над
            видео. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 hidden md:block">
          <Image
            src="/media/decor/bird.webp"
            alt=""
            width={320}
            height={117}
            className="absolute left-[52%] top-10 w-14 -rotate-[7deg] opacity-90"
          />
          <Image
            src="/media/decor/bird.webp"
            alt=""
            width={320}
            height={117}
            className="absolute left-[44%] top-20 w-[4.5rem] rotate-[5deg]"
          />
          <Image
            src="/media/decor/bird.webp"
            alt=""
            width={320}
            height={117}
            className="absolute bottom-16 left-12 w-16 -scale-x-100 rotate-[6deg] opacity-80"
          />
        </div>
        <Container className="relative">
          {/* Заголовок набран здесь, а не через SectionHeading: он на 10%
              крупнее общего размера — это главный блок страницы. Надстрочника
              и подзаголовка нет, шаги сами всё объясняют. */}
          {/* Кнопка «Смотреть видео» — только на телефоне: там ролик лежит под
              всеми четырьмя шагами, и без неё до него мало кто доезжает. Она
              стоит ПОД заголовком и по центру: рядом с ним она отжимала
              «Занятие по шагам» на две строки.
              На ПК всё содержимое блока ужато на 10% (zoom): в полный размер
              заголовок с шагами и роликом не помещались на экран ноутбука
              целиком. zoom, а не scale: блок при этом честно занимает всю
              ширину колонки и не съезжает вбок. */}
          <div className="md:[zoom:0.9]">
            <div className="flex flex-col items-center gap-3 text-center md:block md:text-left">
              <h2 className="whitespace-nowrap text-[1.6rem] font-bold sm:text-[2.05rem]">
                {t("stepsTitle")}
              </h2>
              <WatchVideoBtn target={VIDEO_ID} className="md:hidden" />
            </div>
            {/* items-center: колонки разной высоты (шаги и ролик 9:16), и
                ролик встаёт по центру дорожки шагов — так же, как на тандеме. */}
            <div className="mt-8 md:flex md:items-center md:gap-10">
              {/* На телефоне дорожку шагов ужимаем до ширины ролика под ней:
                  карточки во всю ширину экрана над узким вертикальным видео
                  выглядели обрубком. На ПК шаги забирают всё, что осталось от
                  колонки ролика. */}
              <div className="mx-auto w-full max-w-[330px] md:max-w-none md:flex-1">
                <TrainingSteps steps={steps} />
              </div>
              {/* Ролик снят вертикально (файл 720×1280), показываем в
                  бирюзовой рамке с воздухом вокруг кадра и ВСЕГДА в родных
                  9:16. Раньше на ПК рамка тянулась на всю высоту колонки шагов,
                  видео брало высоту родителя и object-cover срезал ему бока —
                  кадр приезжал примерно как 3:4. Теперь колонка фиксированной
                  ширины, как на странице тандема, и кадр виден целиком. */}
              <div className="mx-auto mt-6 w-full max-w-[330px] rounded-[1.75rem] border-2 border-primary/30 bg-surface p-3 shadow-[0_18px_40px_-30px_rgba(15,34,51,0.5)] md:mt-0 md:w-[300px] md:max-w-none md:shrink-0 lg:w-[340px]">
                <video
                  id={VIDEO_ID}
                  src="/media/video/obuchenie.mp4"
                  poster="/media/video/obuchenie-poster.jpg"
                  controls
                  playsInline
                  preload="none"
                  // Соотношение рамки совпадает с соотношением файла, так что
                  // резать object-cover нечего. В полноэкранном режиме класс
                  // никуда не девается, и браузер подгонял бы вертикальный кадр
                  // под 16:9 монитора — поэтому там contain (по бокам чёрные
                  // поля) и отпущенное соотношение сторон. Дубль с -webkit- —
                  // для старых Safari, где :fullscreen без префикса не
                  // понимается.
                  className="aspect-[9/16] w-full rounded-[1.15rem] bg-surface-2 object-cover [&:-webkit-full-screen]:aspect-auto [&:-webkit-full-screen]:object-contain [&:fullscreen]:aspect-auto [&:fullscreen]:object-contain"
                />
              </div>
            </div>
          </div>
        </Container>
      </Section>

    </>
  );
}
