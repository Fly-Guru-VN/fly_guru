import type { Metadata } from "next";
import { localeAlternates } from "@/lib/alternates";
import Image from "next/image";
import { Container, Section, Badge, Button } from "@/components/ui";
import { Squiggle } from "@/components/Squiggle";
import { BookBtn } from "@/components/BookBtn";
import { JsonLd } from "@/components/JsonLd";
import { PriceTabs, type PriceGroup } from "@/components/PriceTabs";
import { priceListSchema } from "@/lib/schema";
import type { ServiceCategory } from "@/content/services";
import { getActiveServices, getSiteServices, pickService } from "@/lib/services";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatPrice, localizeServices } from "@/lib/serviceText";
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Prices" });

  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: localeAlternates(locale, "/prices"),
  };
}
export const dynamic = "force-static"; // статичная страница, форсим SSG

// Порядок вкладок в прайсе: сначала то, с чего начинают, потом клубное и допы.
const ORDER: ServiceCategory[] = ["training", "tandem", "rental", "subscription", "tour", "extra"];

// Самый ходовой формат школы — карточка с рамкой и меткой «Популярное».
const POPULAR = "basic-adult";

// Прайс: заголовок и сразу под ним шесть тематических вкладок, в каждой
// карточки только своей группы услуг.
//
// Почему вкладки, а не всё подряд. Услуг тринадцать, и списком в шесть колонок
// страница читалась как выгрузка из таблицы: человек, пришедший за ценой
// тандема, пролистывал мимо обучения, выездов и фото/видео. Теперь он тапает
// «Тандем» и видит ровно две карточки.
//
// Карточки при этом лежат в HTML ВСЕ — спрятана только неактивная вкладка
// (см. PriceTabs). Страница статическая, и поисковик получает все цены разом.
export default async function PricesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, tCommon, tCategory, tServices, tSchema] = await Promise.all([
    getTranslations("Prices"),
    getTranslations("Common"),
    getTranslations("ServiceCategories"),
    getTranslations("Services"),
    getTranslations("Schema"),
  ]);

  // Цены — из базы поверх справочника, тексты — из messages; настоящие id —
  // для формы записи. Услугу в базе ищем по коду: названия переводятся.
  const [services, siteRaw] = await Promise.all([getActiveServices(), getSiteServices()]);
  const site = localizeServices(siteRaw, tServices);
  const dbId = (code: string) => services.find((x) => x.code === code)?.id;

  const drone = pickService(site, "drone");

  // Группы для вкладок. Пустых не бывает, но проверяем: услугу могут выключить
  // в админке, и вкладка без карточек выглядела бы поломкой.
  const groups: PriceGroup[] = ORDER.map((cat) => ({
    cat,
    label: tCategory(cat),
    items: site
      .filter((s) => s.category === cat)
      .map((service) => ({
        service,
        serviceId: dbId(service.id),
        highlight: service.id === POPULAR,
      })),
  })).filter((g) => g.items.length > 0);

  // Полоска под карточками: то, что входит в любую цену из прайса. Раньше это
  // было бегущей строкой над списком — но ровно те же слова стоят в карточках
  // и в тексте шапки, и на одном экране повторялись трижды.
  const promises = [
    {
      icon: IconUser,
      title: t("promises.instructorTitle"),
      text: t("promises.instructorText"),
    },
    {
      icon: IconTrend,
      title: t("promises.successTitle"),
      text: t("promises.successText"),
    },
    { icon: IconSmile, title: t("promises.kidsTitle"), text: t("promises.kidsText") },
    { icon: IconVest, title: t("promises.allInTitle"), text: t("promises.allInText") },
    {
      icon: IconShield,
      title: t("promises.bayTitle"),
      text: t("promises.bayText"),
    },
  ];

  // Что входит в съёмку с дрона — тремя короткими фактами, как в карточках
  // форматов на обучении.
  const droneFacts = [
    { icon: IconClock, label: t("droneFacts.session", { minutes: drone.durationMin ?? 0 }) },
    { icon: IconCheck, label: t("droneFacts.raw") },
    { icon: IconDrone, label: t("droneFacts.aerial") },
  ];

  return (
    <>
      {/* Прайс для поисковиков: те же услуги и те же цены, что в карточках
          ниже — и то и другое берётся из базы, разъехаться не может. */}
      <JsonLd
        data={priceListSchema(site, tSchema("catalogName"), (cat) => tCategory(cat))}
      />

      {/* ── Заголовок и вкладки с услугами ── */}
      {/* Первого экрана с фото больше нет (David, 22.09.2026): человек пришёл
          за ценами — под заголовком сразу вкладки с услугами. Кадр
          hero_maket_3 переехал в магазин. Надстрочника «Прайс» тоже нет: он
          повторял название раздела, подсвеченное в шапке. */}
      <Section pad="tight" className="bg-gradient-to-b from-surface-2 to-white sm:pt-14">
        <Container>
          <h1 className="text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">
            {t("title")}
          </h1>
          <Squiggle long className="mt-4" />
          <div className="mt-8">
            <PriceTabs groups={groups} />
          </div>

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
                  alt={t("droneAlt")}
                  width={900}
                  height={900}
                  quality={90}
                  sizes="(min-width: 1024px) 368px, (min-width: 640px) 304px, 256px"
                  className="h-auto w-full"
                />
              </div>

              <div className="mt-6 lg:mt-0 lg:flex-1">
                <Badge>{t("droneBadge")}</Badge>
                <h2 className="mt-4 text-2xl font-bold leading-tight sm:text-3xl">{drone.name}</h2>
                <p className="mt-3 max-w-xl text-muted">
                  {t("droneText", { minutes: drone.durationMin ?? 0 })}
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
                    <p className="text-sm text-muted">{t("dronePrice")}</p>
                    <p className="mt-1 text-3xl font-bold text-primary">{formatPrice(locale, drone.price, tCommon("onRequest"))}</p>
                  </div>
                  <div className="mt-4 sm:mt-0 sm:shrink-0">
                    <BookBtn
                      serviceId={dbId(drone.id)}
                      place="prices-drone"
                      size="lg"
                      className="w-full sm:w-auto"
                    >
                      {t("droneBook")}
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
                t("notes.tours"),
                t("notes.subscription"),
                t("notes.minutes"),
                t("notes.firstLesson"),
              ].map((note) => (
                <li key={note} className="flex gap-2 text-sm text-muted">
                  <IconCheck aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  {note}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button href="/training" variant="secondary">
              {t("moreTraining")} <IconArrowRight className="h-4 w-4" />
            </Button>
            <Button href="/club" variant="secondary">
              {t("moreClub")} <IconArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </Container>
      </Section>

    </>
  );
}
