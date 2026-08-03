import type { Metadata } from "next";
import Image from "next/image";
import { Container, Section, SectionHeading } from "@/components/ui";
import { Media, VideoPlayer } from "@/components/Media";
import { HeroStage } from "@/components/HeroStage";
import { Marquee } from "@/components/Marquee";
import { Rail, RailItem } from "@/components/Rail";
import { StickyBookBar } from "@/components/StickyBookBar";
import { Faq } from "@/components/Faq";
import { FormatCard, type Format } from "@/components/FormatCard";
import { TrainingSteps, type TrainingStep } from "@/components/TrainingSteps";
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
  const steps: TrainingStep[] = [
    {
      meta: "15 минут",
      title: "Инструктаж на берегу",
      text: "Инструктор показывает все нужные положения. Инструктаж проходит на реальной доске. Далее вам подбирают снаряжение и выпускают на воду.",
      image: "/media/photo/training-step-1.webp",
    },
    {
      meta: "Знакомство с фойлом",
      title: "Для начала едем лёжа",
      text: "Для начала осваиваем работу с джойстиком и привыкаем к скорости фойла. Этот этап длится всего 5–7 минут.",
      image: "/media/photo/training-step-2.webp",
    },
    {
      meta: "Практикуем баланс",
      title: "Едем на коленях и в полный рост",
      text: "Та же скорость, но теперь практикуем баланс и ощущение доски. Инструктор держит с вами связь через наушник.",
      image: "/media/photo/training-step-3.webp",
    },
    {
      meta: "Взлетаем",
      title: "Ощущаем полёт",
      text: "Доска поднимается над водой, сопротивление пропадает и вы ощущаете настоящую свободу. Для начала взлетаем на коленях, а потом практикуем полёт стоя.",
      image: "/media/photo/training-step-4.webp",
      // Последний шаг — ради него всё занятие и затевалось: метка оранжевая и
      // со свечением, как в макете.
      highlight: true,
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
      <Section className="relative overflow-hidden pt-12 pb-12 sm:pt-20 sm:pb-20">
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
          <h2 className="text-[1.65rem] font-bold sm:text-[2.05rem]">Занятие по шагам</h2>
          <div className="mt-8 md:grid md:grid-cols-12 md:gap-10">
            <div className="md:col-span-7">
              <TrainingSteps steps={steps} />
            </div>
            {/* Ролик снят вертикально — показываем в родных 9:16, в бирюзовой
                рамке с воздухом вокруг кадра.
                Ширину держим жёстко: при 9:16 колонка в 440 px дала бы кадр
                высотой под 800 px, и видео вылезло бы ниже последнего шага. */}
            {/* self-start обязателен: без него ячейка сетки растягивается на
                высоту колонки с шагами, рамка тянется следом и под видео
                остаётся пустая белая полоса в треть кадра. */}
            <div className="mx-auto mt-8 w-full max-w-[280px] self-start rounded-[1.75rem] border-2 border-primary/30 bg-surface p-3 shadow-[0_18px_40px_-30px_rgba(15,34,51,0.5)] md:col-span-5 md:mt-0 md:max-w-[320px]">
              <VideoPlayer
                src="/media/video/obuchenie.mp4"
                poster="/media/video/obuchenie-poster.jpg"
                ratio="9/16"
                rounded="rounded-[1.15rem]"
              />
            </div>
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
