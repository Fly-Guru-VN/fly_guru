import type { Metadata } from "next";
import Image from "next/image";
import { Container, Section, Badge, buttonClasses } from "@/components/ui";
import { Squiggle } from "@/components/Squiggle";
import { HeroStage } from "@/components/HeroStage";
import { Marquee } from "@/components/Marquee";
import { Media } from "@/components/Media";
import { Faq } from "@/components/Faq";
import { BookBtn } from "@/components/BookBtn";
import {
  IconFoil,
  IconWaves,
  IconClub,
  IconCheck,
  IconClock,
  IconChat,
  IconPeople,
  IconPalm,
  IconInfinity,
  IconArrowRight,
} from "@/components/icons";
import { clubFaq } from "@/content/faq";
import { formatVnd, formatDuration } from "@/content/services";
import { getActiveServices, getSiteServices, pickService } from "@/lib/services";
import { socials } from "@/content/contacts";

export const metadata: Metadata = { title: "Клуб" };
export const dynamic = "force-static"; // статичная страница, форсим SSG

// Клубный Telegram-канал — единственная клубная ссылка, которая реально живёт
// (остальные соцсети школьные). Достаём из общего списка, чтобы адрес правился
// в одном месте.
const TELEGRAM = socials.find((s) => s.name === "Telegram-канал")!.href;

// Страница клуба собрана тем же языком, что обучение и тандем: кадр во весь
// экран, бегущая строка фактов, дальше — только то, что человек спрашивает
// перед покупкой абонемента.
//
// Про что страница: клуб — это не «закрытая тусовка», а два простых факта.
// Первый: катать регулярно по абонементу дешевле почти в полтора раза. Второй:
// после обучения открываются выезды и компания, с которой в море не скучно.
// Всё, чего в CRM ещё нет (уровни, передача минут, «приведи друга»), на
// странице намеренно не обещано.
export default async function ClubPage() {
  // Услуги из базы: цены — для карточек, настоящие id — для формы записи.
  const [services, site] = await Promise.all([getActiveServices(), getSiteServices()]);

  const sub = pickService(site, "subscription");
  const rental = pickService(site, "rental");
  const tours = [pickService(site, "excursion"), pickService(site, "safari")];

  // id услуги в базе — с ним форма записи открывается уже с нужной строкой.
  const dbId = (name: string) => services.find((x) => x.name === name)?.id;
  const subId = dbId(sub.name);

  // Выгода считается из цен базы, а не вписана руками: поправят прайс в
  // админке — цифра на странице поедет следом и не разойдётся с реальностью.
  const subPerMin = Math.round((sub.price as number) / (sub.durationMin as number));
  const rentalPerMin = Math.round((rental.price as number) / (rental.durationMin as number));
  const savings = Math.round((1 - subPerMin / rentalPerMin) * 100);
  const fmtK = (v: number) => `${Math.round(v / 1000)}к ₫ / мин`;

  // Условия абонемента — плашками на кадре: их ищут глазами первыми.
  const heroFacts = [`${sub.durationMin} минут`, `минута дешевле на ${savings}%`, "минуты живут 3 месяца"];

  const marquee = [
    `Абонемент ${sub.durationMin} минут`,
    `Минута дешевле на ${savings}%`,
    "Катаетесь когда удобно",
    "Экскурсии и сафари с командой",
    "Свой Telegram-канал",
    "Нячанг · Marina Beach",
  ];

  // Что входит в абонемент — только то, что школа реально выполняет.
  const included = [
    "Снаряжение, жилет и связь на воде — как на обучении",
    "Минуты списываются по факту катания, а не по расписанию",
    "Первый абонемент необученного гостя включает занятие с инструктором",
    "После обучения — доступ к экскурсиям и сафари",
  ];

  // Путь в клуб. Третий шаг — тот, ради которого всё: помечен как в шагах
  // обучения (оранжевый пульсирующий номер).
  const steps = [
    {
      icon: IconFoil,
      meta: "60 минут",
      title: "Базовое обучение",
      text: "Входная точка: после занятия вы управляете фойлом сами. Если уже уверенно катаетесь — шаг пропускается.",
    },
    {
      icon: IconWaves,
      meta: `${sub.durationMin} минут`,
      title: "Абонемент",
      text: `Покупаете пакет минут и катаете, когда удобно: минута выходит на ${savings}% дешевле разового проката.`,
    },
    {
      icon: IconClub,
      meta: "статус бессрочный",
      title: "Вы в клубе",
      text: "Членство активируется первым абонементом и остаётся навсегда: клубный канал, совместные выезды, своя компания на воде.",
      highlight: true,
    },
  ];

  // Фото к карточкам выездов — по id услуги.
  const tourPhoto: Record<string, { src: string; alt: string; text: string }> = {
    excursion: {
      src: "/media/photo/ekskursiya.webp",
      alt: "Экскурсия на электрофойлах: инструктор с доской у берега острова",
      text: "Чёткая программа на 2–2,5 часа: полёт к острову Черепахи с инструктором, чтобы набрать опыт в открытом море.",
    },
    safari: {
      src: "/media/photo/safari-ostrov.webp",
      alt: "Электрофойлы на белом песке дикого пляжа во время сафари",
      text: "Задача повышенной сложности: остров Обезьян, крутой резорт и дикий пляж Баунти. Маршрут гибкий — куда ехать, решаете вы вместе с гидом.",
    },
  };

  // Три коротких обещания клуба — полоской под шагами, как факты в карточках
  // на главной.
  const perks = [
    { icon: IconChat, label: "Клубный канал", label2: "в Telegram" },
    { icon: IconPeople, label: "Выезды", label2: "с командой" },
    { icon: IconPalm, label: "Острова", label2: "и дикие пляжи" },
  ];

  return (
    <>
      {/* ── Первый экран ── */}
      {/* Кадр с тремя райдерами в открытом море — он и есть весь смысл клуба:
          катают не в одиночку у берега, а компанией и далеко. */}
      <HeroStage
        image="/media/photo/club-3-v-more.webp"
        alt="Трое на электрофойлах идут вместе по открытому морю у гор Нячанга"
        bleed
      >
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-white/80 drop-shadow-[0_1px_8px_rgba(0,0,0,0.5)]">
            Клуб FlyGuru
          </p>
          <h1 className="mt-3 text-4xl font-bold leading-[1.05] drop-shadow-[0_2px_14px_rgba(0,0,0,0.5)] sm:text-5xl md:text-6xl">
            Катайтесь
            <br />
            сколько захотите
          </h1>
          <p className="mt-4 max-w-md text-base text-white/90 drop-shadow-[0_1px_8px_rgba(0,0,0,0.5)] sm:text-lg">
            Пакет минут по выгодной цене, выезды на острова и своя компания на
            воде.
          </p>
        </div>
        <div>
          <ul className="mt-6 flex flex-wrap gap-2">
            {heroFacts.map((f) => (
              <li
                key={f}
                className="rounded-full border border-white/40 bg-white/10 px-3 py-1.5 text-sm font-semibold backdrop-blur-sm"
              >
                {f}
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <BookBtn serviceId={subId} place="club-hero" size="lg" className="w-full sm:w-auto">
              Купить абонемент
            </BookBtn>
            {/* Обычный якорь, а не Button: ссылка ведёт на блок этой же
                страницы, локали и роутинг тут ни при чём. */}
            <a href="#club-path" className={buttonClasses({ variant: "light", size: "lg" })}>
              Как попасть в клуб
            </a>
          </div>
        </div>
      </HeroStage>

      <Marquee items={marquee} />

      {/* ── Абонемент ── */}
      {/* Главный блок страницы: слева считаем выгоду, справа карточка покупки.
          Фон общий с соседними блоками — страница читается одним полотном. */}
      <Section pad="tight" className="relative overflow-hidden bg-gradient-to-b from-white to-surface-2">
        {/* Чайки — как в блоках главной: только от md, на телефоне декор съедал
            бы место. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 hidden md:block">
          <Image
            src="/media/decor/bird.webp"
            alt=""
            width={320}
            height={117}
            className="absolute right-24 top-10 w-14 -rotate-[7deg] opacity-90"
          />
          <Image
            src="/media/decor/bird.webp"
            alt=""
            width={320}
            height={117}
            className="absolute right-8 top-24 w-[4.5rem] rotate-[5deg]"
          />
        </div>

        <Container className="relative">
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-center lg:gap-12">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-primary">Абонемент</p>
              <h2 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">
                Минута дешевле на {savings}%
              </h2>
              <Squiggle long className="mt-4" />
              <p className="mt-5 max-w-xl text-muted">
                Разовый прокат хорош, чтобы вспомнить ощущение. Но как только
                катание становится привычкой, платить за каждый заезд отдельно
                перестаёт иметь смысл: пакет минут окупается уже с пятой каталки.
              </p>

              {/* Две плашки цены рядом: сравнение работает только тогда, когда
                  обе цифры видно одновременно. Своя цена — выделена. */}
              <div className="mt-7 grid max-w-lg grid-cols-2 gap-3">
                <div className="rounded-2xl border-2 border-primary bg-surface p-4 shadow-[0_18px_40px_-30px_rgba(15,34,51,0.5)]">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                    По абонементу
                  </p>
                  <p className="mt-1.5 text-xl font-bold text-primary sm:text-2xl">
                    {fmtK(subPerMin)}
                  </p>
                </div>
                <div className="rounded-2xl border border-line bg-surface p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Разовый прокат
                  </p>
                  <p className="mt-1.5 text-xl font-bold sm:text-2xl">{fmtK(rentalPerMin)}</p>
                </div>
              </div>

              <ul className="mt-7 grid max-w-xl gap-2.5 sm:grid-cols-2">
                {included.map((t) => (
                  <li key={t} className="flex gap-2 text-sm text-muted">
                    <IconCheck aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            {/* Карточка покупки. Рамка и тень как у «популярного» формата на
                обучении — на странице это главное действие. */}
            <div className="mt-8 rounded-3xl border-2 border-primary bg-surface p-6 shadow-[0_24px_50px_-30px_rgba(15,34,51,0.5)] lg:mt-0">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                >
                  <IconWaves className="h-6 w-6" />
                </span>
                <h3 className="text-lg font-bold leading-tight">{sub.name}</h3>
              </div>
              <div className="mt-5 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-primary">{formatVnd(sub.price)}</span>
                <span className="text-sm text-muted">/ {formatDuration(sub)}</span>
              </div>
              <ul className="mt-5 space-y-2.5 text-sm text-muted">
                <li className="flex gap-2">
                  <IconClock aria-hidden className="h-5 w-5 shrink-0 text-primary" />
                  Минуты действуют 3 месяца
                </li>
                <li className="flex gap-2">
                  <IconInfinity aria-hidden className="h-5 w-5 shrink-0 text-primary" />
                  Катаете когда удобно, без записи по расписанию
                </li>
                <li className="flex gap-2">
                  <IconClub aria-hidden className="h-5 w-5 shrink-0 text-primary" />
                  Первый абонемент открывает членство в клубе
                </li>
              </ul>
              <div className="mt-6">
                <BookBtn serviceId={subId} place="club-card" size="lg" className="w-full">
                  Купить абонемент
                </BookBtn>
              </div>
              <p className="mt-3 text-center text-xs text-muted">
                Оставите заявку — свяжемся в мессенджере и всё расскажем.
              </p>
            </div>
          </div>
        </Container>
      </Section>

      {/* ── Как попасть в клуб ── */}
      <Section
        id="club-path"
        pad="tight"
        className="bg-gradient-to-b from-surface-2 to-white"
      >
        <Container>
          <h2 className="text-3xl font-bold sm:text-4xl">Как попасть в клуб</h2>
          <Squiggle long className="mt-4" />

          {/* Дорожка номеров — та же, что на обучении и тандеме: линия идёт
              сквозь весь список, кружки лежат поверх неё и закрывают её собой.
              Считать отрезки от кружка до кружка нельзя — карточки разной
              высоты. На телефоне дорожки нет, кружок сидит верхом на верхней
              границе своей карточки. */}
          {/* Ширину дорожки держим уже колонки: на широком мониторе карточка с
              одной строкой текста растягивалась на 1200 px и читалась пустой. */}
          <ol className="relative mt-6 max-w-4xl md:mt-8">
            {steps.map((s, i) => {
              const first = i === 0;
              const last = i === steps.length - 1;
              return (
                <li key={s.title} className="relative pb-5 pt-7 md:py-3 md:pl-16">
                  <span
                    aria-hidden
                    className={`absolute left-[1.53rem] hidden w-0.5 bg-primary/20 md:block ${
                      first ? "top-1/2" : "top-0"
                    } ${last ? "bottom-1/2" : "bottom-0"}`}
                  />
                  <span
                    aria-hidden
                    className={`absolute left-1/2 top-7 z-10 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 bg-surface text-lg font-bold ring-8 md:left-1 md:top-1/2 md:translate-x-0 ${
                      s.highlight
                        ? "animate-step-glow border-accent text-accent ring-accent/5"
                        : "border-primary/35 text-primary ring-primary/5"
                    }`}
                  >
                    {i + 1}
                  </span>

                  <div className="flex items-center gap-4 rounded-3xl border border-line bg-surface px-4 pb-5 pt-8 shadow-[0_18px_36px_-26px_rgba(15,34,51,0.55)] sm:px-5 md:gap-6 md:py-5">
                    <span
                      aria-hidden
                      className="grid h-[4.5rem] w-[4.5rem] shrink-0 place-items-center rounded-full bg-surface-2 text-primary sm:h-24 sm:w-24"
                    >
                      <s.icon className="h-9 w-9 sm:h-11 sm:w-11" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold uppercase tracking-wide text-accent-strong">
                        {s.meta}
                      </p>
                      <h3 className="mt-1 text-base font-bold leading-tight sm:text-lg">
                        {s.title}
                      </h3>
                      <p className="mt-2 text-sm text-muted">{s.text}</p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>

          {/* Полоска обещаний клуба — приписка к дорожке, а не четвёртый шаг:
              легче карточек и прижата к ним вплотную. */}
          <div className="mt-3 max-w-4xl rounded-2xl border border-line bg-gradient-to-b from-white to-surface-2 px-4 py-3">
            <div className="grid grid-cols-3">
              {perks.map((p, i) => (
                <div
                  key={p.label}
                  className={`flex flex-col items-center justify-start gap-1.5 px-1.5 text-center ${
                    i > 0 ? "border-l border-line" : ""
                  }`}
                >
                  <p.icon aria-hidden className="h-5 w-5 shrink-0 text-primary" />
                  <span className="text-[11px] font-semibold leading-tight text-ink/85 sm:text-xs">
                    {p.label}
                    <br />
                    {p.label2}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <a
              href={TELEGRAM}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClasses({ variant: "sea" })}
            >
              Клубный канал в Telegram <IconArrowRight className="h-4 w-4" />
            </a>
          </div>
        </Container>
      </Section>

      {/* ── Выезды ── */}
      <Section pad="tight" className="bg-white">
        <Container>
          <h2 className="text-3xl font-bold sm:text-4xl">Выезды в море</h2>
          <Squiggle long className="mt-4" />
          <p className="mt-5 max-w-2xl text-muted">
            Экскурсия и сафари — это уже не катание у берега, а несколько часов в
            открытом море. Берём тех, кто уверенно держится на доске: решение за
            инструктором, отдельный абонемент для этого не нужен.
          </p>

          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {tours.map((s) => (
              <div
                key={s.id}
                className="flex h-full flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-[0_18px_40px_-28px_rgba(15,34,51,0.45)]"
              >
                <Media
                  src={tourPhoto[s.id].src}
                  alt={tourPhoto[s.id].alt}
                  ratio="16/9"
                  rounded="rounded-none"
                  sizes="(min-width: 768px) 50vw, 100vw"
                />
                <div className="flex flex-1 flex-col p-5 sm:p-6">
                  <Badge className="self-start">По одобрению инструктора</Badge>
                  <h3 className="mt-3 text-xl font-bold">{s.name}</h3>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-primary">{formatVnd(s.price)}</span>
                    <span className="text-sm text-muted">/ {formatDuration(s)}</span>
                  </div>
                  <p className="mt-3 flex-1 text-sm text-muted">{tourPhoto[s.id].text}</p>
                  {s.note && <p className="mt-2 text-xs text-muted">{s.note}.</p>}
                  <div className="mt-5">
                    <BookBtn
                      serviceId={dbId(s.name)}
                      place="club-tour"
                      variant="secondary"
                      className="w-full"
                    >
                      Записаться
                    </BookBtn>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Container>
      </Section>

      {/* ── Вопросы ── */}
      {/* Фон уходит обратно в морской — тем же приёмом, что на главной: страница
          заканчивается водой, а не белой стеной. */}
      <Section pad="tight" className="bg-gradient-to-b from-white to-surface-2">
        <Container>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
            <Faq items={clubFaq} heading="Вопросы про клуб" />
            {/* Два кадра клубной жизни рядом с вопросами: длинный список ответов
                на широком экране без них выглядит сухой простынёй. На телефоне
                прячем — там они отодвигали бы подвал ещё на экран вниз.
                Кадры тянутся ровно на высоту вопросов (flex-1 в общей высоте
                строки сетки), поэтому колонки заканчиваются на одной линии —
                своей пропорции у них тут нет, лишнее срезается object-cover. */}
            <div className="hidden lg:flex lg:flex-col lg:gap-4">
              {[
                {
                  src: "/media/photo/club-napitok.webp",
                  alt: "Гость клуба летит на фойле с напитком в руке",
                  grow: "flex-[3]",
                  // Кадр вертикальный и в узкой колонке режется: держим окно
                  // выше середины, иначе человеку срезает голову.
                  pos: "object-[50%_22%]",
                },
                {
                  src: "/media/photo/club-kokos.webp",
                  alt: "Гость клуба сидит на доске посреди бухты с кокосом",
                  grow: "flex-[2]",
                  pos: "object-center",
                },
              ].map((p) => (
                <div
                  key={p.src}
                  className={`relative overflow-hidden rounded-3xl bg-surface-2 ${p.grow}`}
                >
                  <Image
                    src={p.src}
                    alt={p.alt}
                    fill
                    sizes="320px"
                    className={`object-cover ${p.pos}`}
                  />
                </div>
              ))}
            </div>
          </div>
        </Container>
      </Section>

    </>
  );
}
