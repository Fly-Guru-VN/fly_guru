import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Container, Section, SectionHeading } from "@/components/ui";
import { BookBtn } from "@/components/BookBtn";
import { Faq } from "@/components/Faq";
import { Squiggle } from "@/components/Squiggle";
import { IconFoil, IconPeople, IconTag } from "@/components/icons";
import { AccessoryCard, EfoilCard } from "@/components/shop/ShopCards";
import { ShopBuyButton } from "@/components/shop/ShopBuyButton";
import { shopAccessories, shopEfoils, type ShopProduct } from "@/content/shop";
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
    alternates: localeAlternates("/shop"),
  };
}

// Три основные линейки — в таблицу «Какой выбрать». Лимитированные серии в неё
// не идут: это те же LIFT5 и LIFTX в особой отделке, а не отдельный выбор.
const COMPARE_IDS = ["lift5-f", "lift5", "liftx"];

// Магазин (этап 1): каталог Lift с ценами в долларах, «Купить» = связаться.
// Порядок блоков — путь покупателя: что есть → чем отличаются → как купить →
// что докупить → ответы на сомнения.
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

  const cheapest = Math.min(...shopEfoils.map(priceFrom));
  const heroFacts = [
    { icon: IconFoil, label: t("facts.linesLabel"), value: t("facts.linesValue") },
    {
      icon: IconTag,
      label: t("facts.priceLabel"),
      value: t("from", { price: formatUsd(cheapest) }),
    },
    { icon: IconPeople, label: t("facts.sizingLabel"), value: t("facts.sizingValue") },
  ];

  const compared = COMPARE_IDS.map((id) => shopEfoils.find((p) => p.id === id)!);
  const compareRows = [
    { label: t("compare.audience"), cells: compared.map((p) => tCat(`${p.id}.audience`)) },
    {
      label: t("compare.ride"),
      cells: compared.map((p) => tProduct("facts.minutes", { minutes: p.rideMinutes })),
    },
    { label: t("compare.sizes"), cells: compared.map((p) => p.sizes.map((s) => s.label).join(", ")) },
    {
      label: t("compare.rider"),
      cells: compared.map((p) =>
        tProduct("upToKg", { kg: Math.max(...p.sizes.map((s) => s.maxRiderKg)) }),
      ),
    },
    {
      label: t("compare.controller"),
      cells: compared.map((p) => p.sizes[0].setup.controller),
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

  return (
    <>
      {/* ── Первый экран ── */}
      {/* Та же плашка, что ведёт сюда с главной, и тот же кадр: наша доска на
          нашей воде. Устройство повторяет блок главной (фото полосой сверху на
          телефоне, текст поверх светлой воды от sm) — там оно уже выверено. */}
      <section className="bg-gradient-to-b from-surface-2 to-white pb-4 pt-6 sm:pt-10">
        <Container>
          <div className="relative isolate overflow-hidden rounded-3xl bg-surface shadow-[0_18px_40px_-28px_rgba(15,34,51,0.45)] sm:min-h-[380px]">
            <div className="relative h-48 sm:absolute sm:inset-0 sm:-z-10 sm:h-auto">
              <Image
                src="/media/photo/shop-hero.webp"
                alt={t("heroAlt")}
                fill
                priority
                sizes="(min-width: 1152px) 1152px, 100vw"
                quality={90}
                className="object-cover object-[70%_50%] sm:object-center"
              />
            </div>
            {/* Колонка текста уже, чем на главной (52%): нос доски на этом
                кадре начинается на ~46% ширины плашки, а заголовок здесь в две
                строки и абзац длиннее — при 54% текст заезжал на доску. */}
            <div className="p-6 sm:flex sm:min-h-[380px] sm:max-w-[48%] sm:flex-col sm:justify-center sm:p-10 lg:max-w-[43%]">
              <p className="text-sm font-semibold uppercase tracking-wide text-primary">
                {t("eyebrow")}
              </p>
              <Squiggle className="mt-3" />
              <h1 className="mt-4 text-3xl font-bold leading-tight sm:text-4xl">{t("title")}</h1>
              <p className="mt-3 text-muted sm:text-lg">{t("lead")}</p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <a
                  href="#efoils"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-strong"
                >
                  {t("toCatalog")}
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
            </div>
          </div>

          <ul className="mt-6 grid gap-4 sm:grid-cols-3">
            {heroFacts.map((f) => (
              <li key={f.label} className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-primary">
                  <f.icon aria-hidden className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-xs text-muted">{f.label}</span>
                  <span className="block text-sm font-bold leading-tight">{f.value}</span>
                </span>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* ── Электрофойлы ── */}
      <Section id="efoils" pad="tight" className="scroll-mt-20">
        <Container>
          <SectionHeading title={t("efoilsTitle")} subtitle={t("efoilsSubtitle")} />
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {shopEfoils.map((p) => (
              <EfoilCard
                key={p.id}
                product={p}
                tagline={tCat(`${p.id}.tagline`)}
                meta={[
                  tProduct("facts.minutesOnMotor", { minutes: p.rideMinutes }),
                  t("sizesCount", { count: p.sizes.length }),
                ].join(" · ")}
                limitedLabel={tProduct("limited")}
                price={priceLabel(p)}
                moreLabel={t("more")}
              />
            ))}
          </div>
          <p className="mt-5 text-sm text-muted">{tProduct("priceNote")}</p>
        </Container>
      </Section>

      {/* ── Какой выбрать ── */}
      <Section pad="tight" tone="muted">
        <Container>
          <SectionHeading title={t("compareTitle")} subtitle={t("compareSubtitle")} />
          {/* Таблица шире телефона — прокручивается сама по себе, страница
              вбок не едет. Первая колонка прилипает, чтобы, листая, было видно,
              какую строку сравниваешь. */}
          <div className="mt-8 overflow-x-auto rounded-3xl border border-line bg-surface">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className="sticky left-0 bg-surface p-4" />
                  {compared.map((p) => (
                    <th key={p.id} scope="col" className="p-4 text-left text-base font-bold">
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
        </Container>
      </Section>

      {/* ── Как купить ── */}
      <Section pad="tight">
        <Container>
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
        </Container>
      </Section>

      {/* ── Аксессуары ── */}
      <Section id="accessories" pad="tight" tone="muted" className="scroll-mt-20">
        <Container>
          <SectionHeading title={t("accessoriesTitle")} subtitle={t("accessoriesSubtitle")} />
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {shopAccessories.map((p) => (
              <AccessoryCard key={p.id} product={p} price={priceLabel(p)} />
            ))}
          </div>
        </Container>
      </Section>

      {/* ── Вопросы + помощь с выбором ── */}
      <Section pad="tight">
        <Container>
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
            <Faq items={faq} heading={t("faqHeading")} />
            <div className="rounded-3xl bg-primary p-6 text-white sm:p-8">
              <h2 className="text-2xl font-bold">{t("ctaTitle")}</h2>
              <p className="mt-2 text-white/85">{t("ctaText")}</p>
              <div className="mt-6 flex flex-col gap-3">
                <ShopBuyButton
                  selection={{ productId: null }}
                  place="shop-cta"
                  className="w-full"
                >
                  {t("ctaButton")}
                </ShopBuyButton>
                <BookBtn place="shop-cta" variant="light" size="lg" className="w-full">
                  {t("ctaBook")}
                </BookBtn>
              </div>
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}
