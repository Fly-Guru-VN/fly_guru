import type { Metadata } from "next";
import { Container, Section, SectionHeading, Card, Badge } from "@/components/ui";
import { Media, VideoPlayer } from "@/components/Media";
import { HeroStage } from "@/components/HeroStage";
import { Rail, RailItem } from "@/components/Rail";
import { StickyBookBar } from "@/components/StickyBookBar";
import { Faq } from "@/components/Faq";
import { IconCheck } from "@/components/icons";
import { formatVnd, formatDuration } from "@/content/services";
import { trainingFaq } from "@/content/faq";
import { BookBtn } from "@/components/BookBtn";
import { getActiveServices, getSiteServices, pickService } from "@/lib/services";

export const metadata: Metadata = { title: "Обучение" };
export const dynamic = "force-static"; // статичная страница, форсим SSG

// Страница обучения собрана под телефон, как и главная: сначала кадр во весь
// экран, дальше — только то, что человек реально спрашивает перед записью:
// что входит, сколько стоит и что со мной будет происходить на воде.
export default async function TrainingPage() {
  // Услуги обучения из базы (с настоящими id) — для выпадающего списка в
  // форме; цены карточек — тоже из базы (правятся в админке, /admin/services).
  const [services, site] = await Promise.all([
    getActiveServices("training"),
    getSiteServices(),
  ]);
  // Заранее выбираем «взрослый базовый» — самый популярный вариант.
  const defaultServiceId = services.find(
    (s) => s.name === pickService(site, "basic-adult").name,
  )?.id;

  // Условия занятия — плашками прямо на кадре: их ищут глазами первыми.
  const facts = ["60 минут", "от 8 лет", "вес до 130 кг"];

  // Что входит в любое занятие. Раньше эти пункты повторялись в каждой из
  // четырёх карточек и раздували их вдвое — теперь сказано один раз.
  const included = [
    ["Всё снаряжение включено", "доска, шлем, жилет"],
    ["Инструктор рядом на воде", "не с берега — идёт рядом всё занятие"],
    ["Связь через наушник", "подсказывает движения прямо в шлем"],
  ];

  const options = [
    { s: pickService(site, "basic-adult"), highlight: true, desc: "Первое знакомство с eFoil под руководством инструктора." },
    { s: pickService(site, "basic-kid"), highlight: false, desc: "Отдельная программа для детей до 14 лет." },
    { s: pickService(site, "individual-training"), highlight: false, desc: "Углублённое занятие один на один с инструктором." },
    { s: pickService(site, "basic-duo"), highlight: false, desc: "Совместное обучение для двух человек с инструктором." },
  ];

  // Что происходит на занятии по шагам. Человеку страшно не «обучение», а
  // неизвестность: сразу ли ставят на доску, что будет, если упаду.
  const steps = [
    {
      title: "Инструктаж на берегу",
      meta: "5–10 минут",
      text: "Разбираем доску и пульт, показываем, как падать и как забираться обратно. Подбираем снаряжение по размеру.",
    },
    {
      title: "Первые метры лёжа",
      meta: "начало занятия",
      text: "Выходите на воду лёжа на доске и привыкаете к тяге. Скорость сначала небольшая — от вас нужно только равновесие.",
    },
    {
      title: "На колени и в полный рост",
      meta: "то же занятие",
      text: "Дальше — на колени, потом встаёте. Инструктор идёт рядом и подсказывает в наушник, куда перенести вес.",
    },
    {
      title: "Полёт на крыле",
      meta: "у 90% — на первом занятии",
      text: "Доска выходит из воды, брызги пропадают, и вы летите. Дальше остаётся держать высоту и учиться поворачивать.",
    },
  ];

  const photos = [
    {
      src: "/media/photo/training-uchenik.webp",
      alt: "Ученик самостоятельно едет на электрофойле",
    },
    {
      src: "/media/photo/training-master.webp",
      alt: "Уверенное катание на электрофойле над водой",
    },
    {
      src: "/media/photo/poza-guru.webp",
      alt: "Инструктор FlyGuru летит на электрофойле сидя в позе лотоса",
    },
  ];

  return (
    <>
      {/* ── Первый экран ── */}
      <HeroStage
        image="/media/photo/training-hero.webp"
        alt="Ученик на электрофойле рядом с инструктором в бухте Нячанга"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/80">
          Базовое обучение
        </p>
        <h1 className="mt-3 text-4xl font-bold leading-[1.05] drop-shadow-sm sm:text-5xl">
          Научитесь летать
          <br />
          на электрофойле
        </h1>
        <p className="mt-4 max-w-md text-base text-white/85 sm:text-lg">
          90% учеников встают на крыло уже на первом занятии — и дальше держат
          баланс и скорость сами.
        </p>
        {/* Сухие условия: раньше лежали списком под текстом и терялись. */}
        <ul className="mt-5 flex flex-wrap gap-2">
          {facts.map((f) => (
            <li
              key={f}
              className="rounded-full border border-white/40 bg-white/10 px-3 py-1.5 text-sm font-semibold backdrop-blur-sm"
            >
              {f}
            </li>
          ))}
        </ul>
        <div className="mt-7">
          <BookBtn
            serviceId={defaultServiceId}
            place="training-hero"
            size="lg"
            className="w-full sm:w-auto"
          >
            Записаться на обучение
          </BookBtn>
        </div>
      </HeroStage>

      {/* ── Что входит в любое занятие ── */}
      <Section className="pt-8 pb-8 sm:pt-12 sm:pb-12">
        <Container>
          <ul className="grid gap-4 sm:grid-cols-3">
            {included.map(([title, sub]) => (
              <li key={title} className="flex gap-3">
                <IconCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <span>
                  <span className="block font-semibold">{title}</span>
                  <span className="text-sm text-muted">{sub}</span>
                </span>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      {/* ── Форматы ── */}
      <Section tone="muted" className="pt-12 pb-12 sm:pt-20 sm:pb-20">
        <Container>
          <SectionHeading
            eyebrow="Форматы"
            title="Выберите вариант"
            subtitle="Снаряжение и инструктор входят в любой из них."
          />
          <Rail className="mt-8 md:grid-cols-4">
            {options.map(({ s, highlight, desc }) => (
              <RailItem key={s.id}>
                <Card className={`flex h-full flex-col ${highlight ? "ring-2 ring-primary" : ""}`}>
                  {highlight && (
                    <div className="mb-3">
                      <Badge>Популярное</Badge>
                    </div>
                  )}
                  <h3 className="text-lg font-bold">{s.name}</h3>
                  <p className="mt-2 flex-1 text-sm text-muted">{desc}</p>
                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-primary">{formatVnd(s.price)}</span>
                    <span className="text-sm text-muted">/ {formatDuration(s)}</span>
                  </div>
                  <div className="mt-4">
                    <BookBtn
                      serviceId={services.find((x) => x.name === s.name)?.id ?? defaultServiceId}
                      place="training-price"
                      variant="secondary"
                      className="w-full"
                    >
                      Записаться
                    </BookBtn>
                  </div>
                </Card>
              </RailItem>
            ))}
          </Rail>
        </Container>
      </Section>

      {/* ── Как проходит занятие ── */}
      <Section className="pt-12 pb-12 sm:pt-20 sm:pb-20">
        <Container>
          <SectionHeading
            eyebrow="Как это выглядит"
            title="Занятие по шагам"
            subtitle="Час на воде выглядит так — с первой минуты и до полёта."
          />
          <div className="mt-8 md:grid md:grid-cols-12 md:gap-10">
            {/* Дорожка шагов — как путь клиента на главной: видно, что это
                последовательность, а не список услуг. */}
            <ol className="md:col-span-7">
              {steps.map((s, i) => (
                <li key={s.title} className="relative pb-6 pl-16 last:pb-0">
                  {i < steps.length - 1 && (
                    <span
                      aria-hidden
                      className="absolute bottom-0 left-[1.4rem] top-12 w-px bg-line"
                    />
                  )}
                  <span
                    aria-hidden
                    className="absolute left-0 top-0 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary"
                  >
                    {i + 1}
                  </span>
                  <p className="text-xs font-semibold uppercase tracking-wide text-accent-strong">
                    {s.meta}
                  </p>
                  <h3 className="mt-1 text-xl font-bold">{s.title}</h3>
                  <p className="mt-2 text-muted">{s.text}</p>
                </li>
              ))}
            </ol>
            {/* Ролик снят вертикально — показываем в родных 9:16. */}
            <VideoPlayer
              src="/media/video/obuchenie.mp4"
              poster="/media/video/obuchenie-poster.jpg"
              ratio="9/16"
              className="mx-auto mt-8 max-w-[260px] md:col-span-5 md:mt-0 md:max-w-[320px]"
            />
          </div>
        </Container>
      </Section>

      {/* ── Фото ── */}
      <Section tone="muted" className="pt-8 pb-8 sm:pt-12 sm:pb-12">
        <Container>
          <Rail className="md:grid-cols-3">
            {photos.map((p) => (
              <RailItem key={p.src}>
                <Media src={p.src} alt={p.alt} ratio="3/4" sizes="(min-width: 768px) 30vw, 85vw" />
              </RailItem>
            ))}
          </Rail>
        </Container>
      </Section>

      {/* ── Сжатый FAQ ── */}
      <Section>
        <Container>
          <SectionHeading eyebrow="Частые вопросы" title="Перед первым занятием" />
          <div className="mt-8 max-w-3xl">
            <Faq items={trainingFaq} />
          </div>
        </Container>
      </Section>

      <StickyBookBar serviceId={defaultServiceId} label="Записаться на обучение" />
    </>
  );
}
