import type { Metadata } from "next";
import Image from "next/image";
import { Container, Section, Badge, Button } from "@/components/ui";
import { Squiggle } from "@/components/Squiggle";
import { BookBtn } from "@/components/BookBtn";
import { StickyBookBar } from "@/components/StickyBookBar";
import { JsonLd } from "@/components/JsonLd";
import { PriceTabs, type PriceGroup } from "@/components/PriceTabs";
import { priceListSchema } from "@/lib/schema";
import {
  CATEGORY_LABELS,
  formatVnd,
  type ServiceCategory,
} from "@/content/services";
import { getActiveServices, getSiteServices, pickService } from "@/lib/services";
import {
  IconDrone,
  IconClock,
  IconCheck,
  IconArrowRight,
  IconShield,
  IconUser,
  IconTrend,
  IconSmile,
  IconVest,
} from "@/components/icons";

export const metadata: Metadata = { title: "Прайс" };
export const dynamic = "force-static"; // статичная страница, форсим SSG

// Порядок вкладок в прайсе: сначала то, с чего начинают, потом клубное и допы.
const ORDER: ServiceCategory[] = ["training", "tandem", "rental", "subscription", "tour", "extra"];

// Самый ходовой формат школы — карточка с рамкой и меткой «Популярное».
const POPULAR = "basic-adult";

// Прайс собран по макету: фигурный кадр в шапке, под ним — шесть тематических
// вкладок, и в каждой карточки только своей группы услуг.
//
// Почему вкладки, а не всё подряд. Услуг тринадцать, и списком в шесть колонок
// страница читалась как выгрузка из таблицы: человек, пришедший за ценой
// тандема, пролистывал мимо обучения, выездов и фото/видео. Теперь он тапает
// «Тандем» и видит ровно две карточки.
//
// Карточки при этом лежат в HTML ВСЕ — спрятана только неактивная вкладка
// (см. PriceTabs). Страница статическая, и поисковик получает все цены разом.
export default async function PricesPage() {
  // Цены и тексты — из базы поверх контента; настоящие id — для формы записи.
  const [services, site] = await Promise.all([getActiveServices(), getSiteServices()]);
  const dbId = (name: string) => services.find((x) => x.name === name)?.id;

  const drone = pickService(site, "drone");

  // Группы для вкладок. Пустых не бывает, но проверяем: услугу могут выключить
  // в админке, и вкладка без карточек выглядела бы поломкой.
  const groups: PriceGroup[] = ORDER.map((cat) => ({
    cat,
    label: CATEGORY_LABELS[cat],
    items: site
      .filter((s) => s.category === cat)
      .map((service) => ({
        service,
        serviceId: dbId(service.name),
        highlight: service.id === POPULAR,
      })),
  })).filter((g) => g.items.length > 0);

  // Полоска под карточками: то, что входит в любую цену из прайса. Раньше это
  // было бегущей строкой над списком — но ровно те же слова стоят в карточках
  // и в тексте шапки, и на одном экране повторялись трижды.
  const promises = [
    {
      icon: IconUser,
      title: "Инструктор на связи",
      text: "Всегда поддерживает связь через наушник",
    },
    {
      icon: IconTrend,
      title: "90% встают на крыло",
      text: "Большинство учеников осваивают доску на первом занятии",
    },
    { icon: IconSmile, title: "Детям с 8 лет", text: "Отдельные детские программы" },
    { icon: IconVest, title: "Всё включено", text: "Снаряжение, жилет, связь на воде" },
    {
      icon: IconShield,
      title: "Безопасная бухта",
      text: "Закрытая бухта без волн и течений",
    },
  ];

  // Что входит в съёмку с дрона — тремя короткими фактами, как в карточках
  // форматов на обучении.
  const droneFacts = [
    { icon: IconClock, label: `Сессия ${drone.durationMin} минут` },
    { icon: IconCheck, label: "Исходники отдаём" },
    { icon: IconDrone, label: "Съёмка с воздуха" },
  ];

  return (
    <>
      {/* Прайс для поисковиков: те же услуги и те же цены, что в карточках
          ниже — и то и другое берётся из базы, разъехаться не может. */}
      <JsonLd data={priceListSchema(site)} />

      {/* ── Шапка ── */}
      {/* Верхнего поля на телефоне нет: кадр идёт полосой встык под шапкой,
          как первый экран тандема. На ПК поле возвращается — там кадр стоит
          сбоку от текста, и без воздуха сверху он упирался бы в шапку. */}
      <Section
        pad="tight"
        className="relative overflow-hidden bg-gradient-to-b from-white to-surface-2 pt-0 lg:pt-14"
      >
        {/* Чайки — тот же декор, что на главной и на обучении. Только от lg:
            на телефоне кадр теперь во всю ширину, и чайки легли бы прямо на
            него. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
          <Image
            src="/media/decor/bird.webp"
            alt=""
            width={320}
            height={117}
            className="absolute left-6 top-24 w-14 -rotate-6 opacity-80"
          />
          <Image
            src="/media/decor/bird.webp"
            alt=""
            width={320}
            height={117}
            className="absolute right-8 top-6 w-16 rotate-[8deg] opacity-80"
          />
        </div>

        <Container className="relative">
          {/* Две пропорции, а не одна: с 1280 контейнер уже упёрся в свои
              72rem и дальше растёт только свободное поле справа, поэтому там
              тексту можно оставить меньше. На 1024–1279 контейнер ещё
              сжимается вместе с окном, и при той же пропорции «Стоимость
              услуг» ломалось на две строки (замерено).

              Кадр стоит в разметке ПЕРВЫМ — так он и должен идти на телефоне.
              На ПК обе колонки расставлены явными col-start, поэтому порядок в
              разметке на них не влияет. */}
          <div className="items-center gap-8 lg:grid lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.7fr)] xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.9fr)]">
            {/* Кадр вырезан волной по нижнему краю (прозрачный PNG → webp),
                поэтому лежит прямо на фоне секции, без рамки и скруглений:
                рамка обрезала бы саму волну.

                Файлов два, и это не дубль. Кадр для ПК панорамный (1400×502) —
                на телефоне он превращается в полоску 140 px высотой. Мобильный
                обрезан по бокам до 1058×570: доска целиком, пустая вода и
                хвост волны справа убраны, и на 390 px кадр выходит 210 px
                высотой — как первый экран тандема.

                Лишнего трафика при этом нет: у каждого кадра в sizes стоит 1px
                для той ширины экрана, где он спрятан, и браузер скачивает для
                него самый мелкий вариант вместо полноразмерного. */}
            <div className="bleed-right relative -mx-4 sm:-mx-6 lg:col-start-2 lg:row-start-1 lg:mx-0">
              <Image
                src="/media/photo/prices/hero-mobile.webp"
                alt="Электрофойл на воде в бухте Нячанга, на фоне город и горы"
                width={1058}
                height={570}
                priority
                quality={90}
                sizes="(min-width: 1024px) 1px, 100vw"
                className="h-auto w-full lg:hidden"
              />
              <Image
                src="/media/photo/prices/hero.webp"
                alt="Электрофойл на воде в бухте Нячанга, на фоне город и горы"
                width={1400}
                height={502}
                priority
                quality={90}
                sizes="(min-width: 1024px) 900px, 1px"
                className="hidden h-auto w-full lg:block"
              />
              {/* Плашка «Безопасно» — по макету hero_maket_2, где David
                  поставил её сам. Координаты сняты с макета пикселями и
                  заданы ДОЛЯМИ кадра, а не пикселями: кадр тянется вместе с
                  экраном, и любой пиксельный отступ разъехался бы.

                  left: 63% — левый край плашки. Доска на фотографии кончается
                  на 62% ширины (замерено), дальше только небо и город. Именно
                  эта цифра держит плашку в стороне от фойла на ЛЮБОЙ ширине,
                  поэтому ширину плашки не задаём вовсе: её определяют left и
                  right, и свободную зону справа от доски она занимает целиком.

                  На телефоне плашки нет совсем: там кадр идёт полосой во всю
                  ширину, и любая карточка поверх него закрывала бы доску. */}
              <div className="hidden rounded-2xl border border-line bg-surface/95 shadow-[0_16px_36px_-28px_rgba(15,34,51,0.55)] backdrop-blur-sm lg:absolute lg:left-[63%] lg:right-[8%] lg:top-[8%] lg:block lg:p-3.5">
                <p className="flex items-center gap-2 text-sm font-bold">
                  <IconShield aria-hidden className="h-5 w-5 shrink-0 text-primary" />
                  Безопасно
                </p>
                <p className="mt-1 text-[11px] leading-snug text-muted">
                  Всё снаряжение включено, инструктор всегда на связи.
                </p>
              </div>
            </div>

            {/* Надстрочника «Прайс» над заголовком больше нет: он повторял
                название раздела, которое и так подсвечено в шапке. */}
            <div className="mt-7 lg:col-start-1 lg:row-start-1 lg:mt-0">
              <h1 className="text-3xl font-bold leading-tight sm:text-4xl">Стоимость услуг</h1>
              <Squiggle long className="mt-4" />
              <p className="mt-5 max-w-xl text-muted">
                Все цены в донгах (₫), оплата на месте. Снаряжение, жилет и связь на
                воде входят в стоимость занятия — доплачивать за них не нужно.
              </p>
            </div>
          </div>
        </Container>
      </Section>

      {/* ── Вкладки с услугами ── */}
      <Section pad="tight" className="bg-gradient-to-b from-surface-2 to-white">
        <Container>
          <PriceTabs groups={groups} />

          <div className="mt-10 overflow-hidden rounded-3xl border border-line bg-surface">
            <ul className="grid sm:grid-cols-2 lg:grid-cols-5">
              {promises.map((p, i) => (
                <li
                  key={p.title}
                  // Разделители рисуем только там, где соседи реально стоят
                  // рядом: на телефоне колонка одна, и вертикальные линии
                  // висели бы в воздухе.
                  className={`flex items-start gap-2.5 border-line p-3.5 ${
                    i > 0 ? "border-t sm:border-t-0" : ""
                  } ${i % 2 === 1 ? "sm:border-l" : ""} ${
                    i >= 2 ? "sm:border-t" : ""
                  } lg:border-l lg:border-t-0 ${i === 0 ? "lg:border-l-0" : ""}`}
                >
                  <span
                    aria-hidden
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                  >
                    <p.icon className="h-[18px] w-[18px]" />
                  </span>
                  {/* На ПК колонок пять на 1152 px — заголовок ужимаем на
                      пункт, иначе «Инструктор на связи» встаёт в две строки и
                      полоска растёт вдвое. */}
                  <span className="min-w-0">
                    <span className="block text-sm font-bold leading-tight lg:text-[13px]">
                      {p.title}
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted lg:text-[11px]">
                      {p.text}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </Section>

      {/* ── Съёмка с дрона ── */}
      {/* Услуга новая, поэтому кроме карточки во вкладке «Дополнительно» ей дан
          отдельный блок: «съёмка с дрона» ничего не говорит, пока не объяснить,
          что дрон идёт над водой следом за вами и что записи остаются у вас. */}
      <Section pad="tight" className="bg-white">
        <Container>
          <div className="overflow-hidden rounded-3xl border-2 border-primary bg-gradient-to-br from-surface via-surface to-surface-2 p-6 shadow-[0_24px_50px_-30px_rgba(15,34,51,0.5)] sm:p-8">
            <div className="lg:flex lg:items-center lg:gap-10">
              {/* Сам дрон — крупно. Услугу продаёт именно он: «съёмка с дрона»
                  словами ничего не говорит, а оранжевый аппарат с камерой
                  узнаётся мгновенно. Кадр не декоративный (это ровно то, что
                  полетит рядом с вами), поэтому у него настоящий alt. */}
              <div className="mx-auto max-w-[16rem] shrink-0 sm:max-w-[19rem] lg:mx-0 lg:w-[23rem] lg:max-w-none">
                <Image
                  src={drone.image ?? "/placeholders/media.svg"}
                  alt="Дрон Hover Aqua Pro в полёте над морем"
                  width={900}
                  height={900}
                  quality={90}
                  sizes="(min-width: 1024px) 368px, (min-width: 640px) 304px, 256px"
                  className="h-auto w-full"
                />
              </div>

              <div className="mt-6 lg:mt-0 lg:flex-1">
                <Badge>Новое</Badge>
                <h2 className="mt-4 text-2xl font-bold leading-tight sm:text-3xl">{drone.name}</h2>
                <p className="mt-3 max-w-xl text-muted">
                  Дрон Hover Aqua Pro идёт над водой следом за вами и снимает
                  полёт со стороны. Одна сессия длится {drone.durationMin} минут,
                  все исходники отдаём без обработки. Если потребуется
                  обработка — у нас есть услуга монтажа.
                </p>

                <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-3">
                  {droneFacts.map((f) => (
                    <li key={f.label} className="flex items-center gap-2 text-sm font-semibold">
                      <f.icon aria-hidden className="h-5 w-5 shrink-0 text-primary" />
                      {f.label}
                    </li>
                  ))}
                </ul>

                {/* Цена и кнопка полосой под текстом, а не третьим столбцом:
                    столбец рядом с крупным кадром оставлял тексту узкую
                    колонку, и абзац вставал в семь строк. */}
                <div className="mt-6 border-t border-line pt-5 sm:flex sm:items-center sm:justify-between sm:gap-6">
                  <div>
                    <p className="text-sm text-muted">Стоимость сессии</p>
                    <p className="mt-1 text-3xl font-bold text-primary">{formatVnd(drone.price)}</p>
                  </div>
                  <div className="mt-4 sm:mt-0 sm:shrink-0">
                    <BookBtn
                      serviceId={dbId(drone.name)}
                      place="prices-drone"
                      size="lg"
                      className="w-full sm:w-auto"
                    >
                      Заказать съёмку
                    </BookBtn>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </Section>

      {/* ── Приписки и переходы ── */}
      <Section pad="tight" className="bg-gradient-to-b from-white to-surface-2">
        <Container>
          <div className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {[
                "Экскурсия и сафари — по одобрению инструктора: вы должны хорошо чувствовать доску.",
                "Абонемент выгоднее разового проката.",
                "Минуты абонемента действуют 3 месяца и списываются по факту катания.",
                "Первый абонемент включает обучающее занятие с инструктором.",
              ].map((t) => (
                <li key={t} className="flex gap-2 text-sm text-muted">
                  <IconCheck aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button href="/training" variant="secondary">
              Подробнее об обучении <IconArrowRight className="h-4 w-4" />
            </Button>
            <Button href="/club" variant="secondary">
              Про клуб и абонемент <IconArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </Container>
      </Section>

      <StickyBookBar />
    </>
  );
}
