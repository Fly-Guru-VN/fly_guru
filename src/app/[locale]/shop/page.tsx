import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Container, Section, SectionHeading, buttonClasses } from "@/components/ui";
import { BookBtn } from "@/components/BookBtn";
import { Faq } from "@/components/Faq";
import { Squiggle } from "@/components/Squiggle";
import {
  IconArrowRight,
  IconPeople,
  IconSliders,
  IconWaves,
  IconWrench,
} from "@/components/icons";
import { AccessoryCard, EfoilCard } from "@/components/shop/ShopCards";
import { ShopBuyButton } from "@/components/shop/ShopBuyButton";
import { ShopFilter } from "@/components/shop/ShopFilter";
import { ShopTabs } from "@/components/shop/ShopTabs";
import {
  SHOP_ACCESSORY_KINDS,
  SHOP_BRANDS,
  shopAccessories,
  shopEfoils,
  type ShopProduct,
} from "@/content/shop";
import { localeAlternates } from "@/lib/alternates";
import { formatUsd, priceFrom, pricesVary } from "@/lib/shop";

export const dynamic = "force-static"; // статичная страница, форсим SSG

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Shop" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: localeAlternates(locale, "/shop"),
  };
}

// Что идёт в таблицу «Какой выбрать»: три основные линейки Lift и доска
// Hobbywing. Лимитированные серии в неё не идут — это те же LIFT5 и LIFTX в
// особой отделке, а не отдельный выбор; S1 Pack — та же S1, но с довеском.
const COMPARE_IDS = ["lift5-f", "lift5", "liftx", "hobby-s1"];

// Флагман Lift — карточка с рамкой и оранжевой плашкой, как на макете.
const FEATURED_ID = "lift5";

// Магазин: каталог Lift и Hobbywing с ценами в долларах, «Купить» = связаться.
// Собран по макетам David'а (photo_video/shop, ref_1…3, сентябрь 2026): первый
// экран с кадром справа, под ним три вкладки — доски, аксессуары и «помощь с
// выбором» (сравнение, как купить, вопросы).
export default async function ShopPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Shop");
  const tCat = await getTranslations("ShopCatalog");
  const tProduct = await getTranslations("ShopProduct");

  // «от» — только там, где размеры или варианты правда стоят по-разному.
  const priceLabel = (p: ShopProduct) =>
    pricesVary(p) ? t("from", { price: formatUsd(priceFrom(p)) }) : formatUsd(priceFrom(p));

  const perks = [
    { icon: IconPeople, title: t("perks.fitTitle"), text: t("perks.fitText") },
    { icon: IconWaves, title: t("perks.tryTitle"), text: t("perks.tryText") },
    { icon: IconWrench, title: t("perks.allTitle"), text: t("perks.allText") },
  ];

  const compared = COMPARE_IDS.map((id) => shopEfoils.find((p) => p.id === id)!);
  // Чего производитель не сказал — то и в таблице честно «уточним», а не
  // прочерк, который читается как «нет такого».
  const unknown = t("compare.unknown");
  const compareRows = [
    { label: t("compare.audience"), cells: compared.map((p) => tCat(`${p.id}.audience`)) },
    {
      label: t("compare.ride"),
      cells: compared.map((p) =>
        p.rideMinutes ? tProduct("facts.minutes", { minutes: p.rideMinutes }) : unknown,
      ),
    },
    { label: t("compare.sizes"), cells: compared.map((p) => p.sizes.map((s) => s.label).join(", ")) },
    {
      label: t("compare.rider"),
      cells: compared.map((p) => {
        const known = p.sizes.map((s) => s.maxRiderKg).filter((kg): kg is number => !!kg);
        return known.length ? tProduct("upToKg", { kg: Math.max(...known) }) : unknown;
      }),
    },
    {
      label: t("compare.controller"),
      cells: compared.map((p) => p.sizes[0].setup.controller ?? unknown),
    },
    { label: t("compare.price"), cells: compared.map(priceLabel) },
  ];

  const steps = [
    { title: t("how.chooseTitle"), text: t("how.chooseText") },
    { title: t("how.contactTitle"), text: t("how.contactText") },
    { title: t("how.getTitle"), text: t("how.getText") },
  ];

  const faq = (["try", "price", "size"] as const).map((key) => ({
    q: t(`faq.${key}Q`),
    a: t(`faq.${key}A`),
  }));

  // Панели вкладок рисуются здесь, на сервере, и уходят в ShopTabs готовыми:
  // карточки так и остаются серверными ссылками.
  const efoilsPanel = (
    <>
      <div className="mt-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold sm:text-4xl">{t("efoilsTitle")}</h2>
          <Squiggle className="mt-3" />
          <p className="mt-3 max-w-2xl text-muted">{t("efoilsSubtitle")}</p>
        </div>
        <ShopBuyButton selection={{ productId: null }} place="shop-efoils" variant="ghost" size="md" className="!px-0">
          {t("consult")} <IconArrowRight aria-hidden className="h-4 w-4" />
        </ShopBuyButton>
      </div>
      {/* Бренды в одной сетке, но с фильтром: цены у них считаются по-разному,
          и человек должен видеть, чью доску смотрит, — бренд подписан в
          карточке, а сноска о ценах стоит под сеткой. */}
      <ShopFilter
        ariaLabel={t("brandFilter")}
        chips={[
          { key: "all", label: t("allModels") },
          ...SHOP_BRANDS.map((b) => ({ key: b, label: b })),
        ]}
        aside={
          <a href="#help" className={buttonClasses({ variant: "secondary", size: "md" })}>
            <IconSliders aria-hidden className="h-5 w-5" />
            {t("compareButton")}
          </a>
        }
        gridClassName="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
        items={shopEfoils.map((p) => ({
          id: p.id,
          tags: [p.brand],
          node: (
            <EfoilCard
              product={p}
              badge={tCat(`${p.id}.badge`)}
              featured={p.id === FEATURED_ID}
              tagline={tCat(`${p.id}.tagline`)}
              colorLabel={tProduct("color")}
              price={priceLabel(p)}
              moreLabel={t("more")}
            />
          ),
        }))}
      />
      <p className="mt-6 text-sm text-muted">{t("priceNote")}</p>
      <HelpBanner
        title={t("efoilsHelpTitle")}
        text={t("efoilsHelpText")}
        button={t("efoilsHelpButton")}
        place="shop-efoils-help"
        media={
          <Image
            src="/brand/flyguru-logo.jpg"
            alt=""
            width={96}
            height={96}
            className="h-16 w-16 rounded-full border-4 border-white shadow-sm sm:h-20 sm:w-20"
          />
        }
      />
    </>
  );

  const accessoriesPanel = (
    <>
      <div className="mt-10">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">
          {t("accessoriesEyebrow")}
        </p>
        <h2 className="mt-2 text-3xl font-bold sm:text-4xl">{t("accessoriesTitle")}</h2>
        <Squiggle className="mt-3" />
        <p className="mt-3 max-w-2xl text-muted">{t("accessoriesSubtitle")}</p>
      </div>
      <ShopFilter
        ariaLabel={t("kindFilter")}
        chips={[
          { key: "all", label: t("allAccessories") },
          ...SHOP_ACCESSORY_KINDS.map((k) => ({ key: k, label: t(`kinds.${k}`) })),
        ]}
        gridClassName="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4"
        items={shopAccessories.map((p) => ({
          id: p.id,
          tags: [p.kind],
          node: (
            <AccessoryCard
              product={p}
              price={priceLabel(p)}
              kindLabel={t(`kinds.${p.kind}`)}
              fitsLabel={tProduct("fits")}
              moreLabel={t("more")}
            />
          ),
        }))}
      />
      <HelpBanner
        title={t("accessoriesHelpTitle")}
        text={t("accessoriesHelpText")}
        button={t("accessoriesHelpButton")}
        place="shop-accessories-help"
        media={
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-primary shadow-sm sm:h-20 sm:w-20">
            <IconWrench aria-hidden className="h-8 w-8" />
          </span>
        }
      />
    </>
  );

  const helpPanel = (
    <>
      {/* ── Какой выбрать ── */}
      <div className="mt-10">
        <SectionHeading title={t("compareTitle")} subtitle={t("compareSubtitle")} />
        {/* Таблица шире телефона — прокручивается сама по себе, страница
            вбок не едет. Первая колонка прилипает, чтобы, листая, было видно,
            какую строку сравниваешь. */}
        <div className="mt-8 overflow-x-auto rounded-3xl border border-line bg-surface">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="sticky left-0 bg-surface p-4" />
                {compared.map((p) => (
                  <th key={p.id} scope="col" className="p-4 text-left text-base font-bold">
                    {/* Бренд над названием: «S1» рядом с «LIFT5» само по себе
                        не говорит, чья это доска. */}
                    <span className="block text-xs font-normal text-muted">{p.brand}</span>
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {compareRows.map((row) => (
                <tr key={row.label}>
                  <th
                    scope="row"
                    className="sticky left-0 bg-surface p-4 text-left font-medium text-muted"
                  >
                    {row.label}
                  </th>
                  {row.cells.map((cell, i) => (
                    <td key={compared[i].id} className="p-4 font-semibold">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Как купить ── */}
      <div className="mt-16">
        <SectionHeading title={t("howTitle")} />
        <ol className="mt-8 grid gap-4 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="rounded-3xl border border-line bg-surface p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-lg font-bold text-white">
                {i + 1}
              </span>
              <h3 className="mt-4 text-lg font-bold">{s.title}</h3>
              <p className="mt-1.5 text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </div>

      {/* ── Вопросы + помощь с выбором ── */}
      <div className="mt-16 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <Faq items={faq} heading={t("faqHeading")} />
        <div className="rounded-3xl bg-primary p-6 text-white sm:p-8">
          <h2 className="text-2xl font-bold">{t("ctaTitle")}</h2>
          <p className="mt-2 text-white/85">{t("ctaText")}</p>
          <div className="mt-6 flex flex-col gap-3">
            <ShopBuyButton selection={{ productId: null }} place="shop-cta" className="w-full">
              {t("ctaButton")}
            </ShopBuyButton>
            <BookBtn place="shop-cta" variant="light" size="lg" className="w-full">
              {t("ctaBook")}
            </BookBtn>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* ── Первый экран ── */}
      {/* Собран по макету Ref 1 так же, как первый экран тандема, на кадре
          hero_maket_3 (до 22.09.2026 он стоял в прайсе): до lg кадр идёт
          полосой во всю ширину, текст под ним; от lg кадр уходит в правый
          верхний угол окна и стоит там враспор, а текст занимает левую
          половину.

          min-h на ПК — ровно по высоте кадра. Кадр лежит absolute, то есть
          высоту секции не задаёт; её задавал бы текст, а он ниже кадра — и
          волну по нижнему краю фотографии срезало бы overflow-hidden. 29.4vw —
          это и есть высота кадра: 52% ширины окна, делённые на пропорцию
          файла 1669/942. Меняете долю кадра или файл — пересчитайте. */}
      <section className="relative overflow-hidden bg-gradient-to-b from-white to-surface-2 lg:flex lg:min-h-[29.4vw] lg:items-center">
        {/* Чайки — как в блоках главной. Обе слева: справа от lg кадр. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
          <Image
            src="/media/decor/bird.webp"
            alt=""
            width={320}
            height={117}
            className="absolute left-6 top-24 w-14 -rotate-[7deg] opacity-90"
          />
          <Image
            src="/media/decor/bird.webp"
            alt=""
            width={320}
            height={117}
            className="absolute left-2 top-48 w-[4.5rem] rotate-[5deg] opacity-80"
          />
        </div>

        {/* 52%, а не 56% как у тандема. Кадр прижат к краю ОКНА, а текст живёт
            в контейнере, который с ростом окна отъезжает вправо быстрее, чем
            левый край кадра, — значит доля кадра решает, сойдутся они или нет.
            Непрозрачная часть кадра должна начинаться правее середины окна. У
            тандема это выходит само собой (слева у файла 12.5% прозрачного
            поля), у этого кадра поля всего 4%, и при 56% текст лез под воду
            уже с 1200 px. При 52% зазор держится на всех ширинах.
            У файла уже зашиты скруглённый левый край и волна снизу. На узком
            экране он сдвинут влево на свою прозрачную полосу (4.2%), иначе
            слева оставалась бы проплешина. */}
        <div className="lg:absolute lg:inset-y-0 lg:right-0 lg:flex lg:w-[52%] lg:items-start">
          <div className="relative -ml-[4.2%] w-[104.2%] lg:ml-0 lg:w-full">
            <Image
              src="/media/photo/shop/hero.webp"
              alt={t("heroAlt")}
              width={1669}
              height={942}
              priority
              quality={90}
              sizes="(min-width: 1024px) 60vw, 105vw"
              className="h-auto w-full"
            />
          </div>
        </div>

        <Container className="relative">
          <div className="pb-10 pt-8 lg:max-w-[46%] lg:py-12">
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">
              {t("eyebrow")}
            </p>
            <Squiggle className="mt-3" />
            <h1 className="mt-4 text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">
              {t("title")}
            </h1>
            <p className="mt-5 max-w-xl text-muted sm:text-lg">{t("lead")}</p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <a href="#efoils" className={buttonClasses({ variant: "primary", size: "md" })}>
                {t("toCatalog")} <IconArrowRight aria-hidden className="h-4 w-4" />
              </a>
              <ShopBuyButton
                selection={{ productId: null }}
                place="shop-hero"
                variant="secondary"
                size="md"
              >
                {t("consult")}
              </ShopBuyButton>
            </div>
            {/* Логотипы брендов — официальные: Hobbywing с их сайта, Lift —
                с обложки их каталога 2026 (на сайте только крошечный PNG).
                Приглушены, чтобы не спорить с кнопками. */}
            <div className="mt-7 flex items-center gap-6">
              <Image
                src="/media/shop/brands/lift-foils.webp"
                alt="Lift Foils"
                width={409}
                height={200}
                className="h-10 w-auto opacity-80"
              />
              <span aria-hidden className="h-8 w-px bg-line" />
              <Image
                src="/media/shop/brands/hobbywing.webp"
                alt="Hobbywing"
                width={634}
                height={114}
                className="h-6 w-auto opacity-80"
              />
            </div>
          </div>
        </Container>
      </section>

      {/* ── Три обещания + вкладки каталога ── */}
      {/* Верхнее поле почти убрано: у текста героя своё нижнее поле, и вместе
          они давали пустую полосу во весь экран между логотипами и пунктами. */}
      <Section pad="tight" className="bg-gradient-to-b from-surface-2 to-white !pt-2">
        <Container>
          <ul className="grid gap-4 sm:grid-cols-3 sm:gap-0">
            {perks.map((p, i) => (
              <li
                key={p.title}
                className={`flex items-center gap-3 sm:px-6 ${i > 0 ? "sm:border-l sm:border-line" : "sm:pl-0"}`}
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-primary shadow-sm">
                  <p.icon aria-hidden className="h-6 w-6" />
                </span>
                <span>
                  <span className="block font-bold leading-tight">{p.title}</span>
                  <span className="mt-0.5 block text-sm text-muted">{p.text}</span>
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-10">
            <ShopTabs
              ariaLabel={t("tabs.aria")}
              labels={{
                efoils: t("tabs.efoils"),
                accessories: t("tabs.accessories"),
                help: t("tabs.help"),
              }}
              panels={{ efoils: efoilsPanel, accessories: accessoriesPanel, help: helpPanel }}
            />
          </div>
        </Container>
      </Section>
    </>
  );
}

// Плашка «не уверены — поможем» под сеткой каталога: картинка слева, текст,
// оранжевая кнопка справа. На телефоне всё в столбик.
function HelpBanner({
  title,
  text,
  button,
  place,
  media,
}: {
  title: string;
  text: string;
  button: string;
  place: string;
  media: React.ReactNode;
}) {
  return (
    <div className="mt-10 flex flex-col items-start gap-4 rounded-3xl bg-gradient-to-r from-primary/10 to-surface-2 p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-6">
      <span className="shrink-0">{media}</span>
      <div className="min-w-0 flex-1">
        <h3 className="text-lg font-bold sm:text-xl">{title}</h3>
        <p className="mt-1 text-sm text-muted sm:text-base">{text}</p>
      </div>
      <ShopBuyButton
        selection={{ productId: null }}
        place={place}
        size="md"
        className="w-full shrink-0 sm:w-auto"
      >
        {button}
      </ShopBuyButton>
    </div>
  );
}
