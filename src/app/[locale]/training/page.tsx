import type { Metadata } from "next";
import { Container, Section, SectionHeading } from "@/components/ui";
import { Media, VideoPlayer } from "@/components/Media";
import { HeroStage } from "@/components/HeroStage";
import { Marquee } from "@/components/Marquee";
import { Rail, RailItem } from "@/components/Rail";
import { StickyBookBar } from "@/components/StickyBookBar";
import { Faq } from "@/components/Faq";
import { FormatCard, type Format } from "@/components/FormatCard";
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

  // Бегущая строка под первым экраном — та же, что на главной, но факты свои.
  // Сюда же ушло то, что раньше висело отдельным блоком с галочками
  // («снаряжение включено», «инструктор на связи»): три строки текста занимали
  // целый экран ради того, что и так повторяется в карточках форматов.
  const marquee = [
    "Всё снаряжение включено",
    "Инструктор на связи",
    "90% встают на крыло на первом занятии",
    "Закрытая безопасная бухта",
    "Дети с 8 лет",
  ];

  // Услугу в базе ищем по названию: в контенте и в базе они совпадают (связь
  // услуг сайта с базой — по коду, см. getSiteServices).
  const dbId = (name: string) => services.find((x) => x.name === name)?.id ?? defaultServiceId;

  const formats: Format[] = [
    {
      service: pickService(site, "basic-adult"),
      desc: "Первое знакомство с eFoil под руководством инструктора.",
      image: "/media/photo/format-solo.webp",
      highlight: true,
      facts: [
        { icon: IconVest, label: "Снаряжение включено" },
        { icon: IconUser, label: "Инструктор на связи" },
        { icon: IconShield, label: "Безопасно" },
      ],
    },
    {
      service: pickService(site, "basic-kid"),
      desc: "Отдельная программа для детей до 14 лет.",
      image: "/media/photo/format-kid.webp",
      facts: [
        { icon: IconVest, label: "Снаряжение включено" },
        { icon: IconSmile, label: "Детская программа" },
        { icon: IconShield, label: "Безопасно" },
      ],
    },
    {
      service: pickService(site, "individual-training"),
      desc: "Инструктор выезжает с вами на воду и точнее контролирует процесс обучения.",
      image: "/media/photo/format-solo.webp",
      facts: [
        { icon: IconUser, label: "1 на 1 с инструктором" },
        { icon: IconSliders, label: "Индивидуальный подход" },
        { icon: IconTrend, label: "Быстрый прогресс" },
      ],
    },
    {
      service: pickService(site, "basic-duo"),
      desc: "Совместное обучение для двух человек.",
      image: "/media/photo/format-duo.webp",
      facts: [
        { icon: IconPeople, label: "Для двоих учеников" },
        { icon: IconUser, label: "Инструктор на связи" },
        { icon: IconShield, label: "Безопасно" },
      ],
    },
  ].map((f) => ({ ...f, serviceId: dbId(f.service.name) }));

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
      {/* Кадр во весь экран и вплотную к шапке, как видео на главной: продаёт
          сама картинка полёта, а не текст над ней. split — на телефоне
          заголовок уходит в небо над фойлерами, кнопка остаётся внизу. */}
      <HeroStage
        image="/media/photo/training-hero.webp"
        alt="Двое летят на электрофойлах над морем в Нячанге"
        bleed
        split
      >
        <div>
          <h1 className="text-4xl font-bold leading-[1.05] drop-shadow-[0_2px_14px_rgba(0,0,0,0.5)] sm:text-5xl md:text-6xl">
            Научитесь летать
            <br />
            на электрофойле
          </h1>
          <p className="mt-4 max-w-md text-base text-white/90 drop-shadow-[0_1px_8px_rgba(0,0,0,0.5)] sm:text-lg">
            Опыт не требуется. Уже на первом занятии вы встанете на крыло.
          </p>
        </div>
        <div>
          {/* Сухие условия: раньше лежали списком под текстом и терялись.
              На ПК содержимое кадра идёт одним блоком, поэтому отступ от
              абзаца выше задаём сами (на телефоне блоки разведены по краям). */}
          <ul className="flex flex-wrap gap-2 md:mt-6">
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
              Записаться на обучение
            </BookBtn>
          </div>
        </div>
      </HeroStage>

      <Marquee items={marquee} />

      {/* ── Форматы ── */}
      {/* Без заголовка секции: карточки и так подписаны, а «Форматы. Выберите
          вариант» отодвигало сами варианты на пол-экрана вниз. */}
      {/* Верхнее поле маленькое: над карточками уже есть свой поясок под метку
          «Популярное» (pt-10 в FormatCard), и обычный отступ секции складывался
          бы с ним в пустую полосу. */}
      <Section tone="muted" className="pt-4 pb-12 sm:pt-6 sm:pb-20">
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
                  <span className="font-semibold">В стоимость входит:</span> eFoil, жилет, шлем,
                  рация, спец-экипировка.
                </span>
              </p>
              <span aria-hidden className="hidden h-5 w-px shrink-0 bg-line sm:block" />
              <p className="flex items-start gap-2 sm:items-center">
                <IconShield aria-hidden className="mt-px h-4 w-4 shrink-0 text-primary sm:mt-0" />
                <span>Все занятия проходят в безопасной закрытой бухте.</span>
              </p>
            </div>
          </div>
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
