import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Container, Section } from "@/components/ui";
import { IconArrowRight, IconCheck } from "@/components/icons";
import { AccessoryConfigurator } from "@/components/shop/AccessoryConfigurator";
import { AccessoryCard } from "@/components/shop/ShopCards";
import { EfoilConfigurator } from "@/components/shop/EfoilConfigurator";
import { shopAccessories, shopProducts } from "@/content/shop";
import { localeAlternates } from "@/lib/alternates";
import { findShopProduct, formatUsd, priceFrom, pricesVary } from "@/lib/shop";

export const dynamic = "force-static"; // статичная страница, форсим SSG
// Товаров ровно столько, сколько в справочнике: чужой адрес — честная 404, а
// не пустая карточка «Модель: что-угодно», как было у заглушки.
export const dynamicParams = false;

export function generateStaticParams() {
  return shopProducts.map((p) => ({ model: p.id }));
}

type Params = Promise<{ locale: string; model: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, model } = await params;
  const product = findShopProduct(model);
  if (!product) return {};
  const t = await getTranslations({ locale, namespace: "ShopCatalog" });
  return {
    title: product.name,
    description: t(`${product.id}.tagline`),
    alternates: localeAlternates(locale, `/shop/${product.id}`),
  };
}

// Сколько пунктов «главного о модели» может лежать в messages. Массивов там
// нет намеренно: перевод накладывается на русский ГЛУБОКИМ слиянием
// (i18n/request.ts), и массив превратился бы в объект с ключами 0, 1, 2.
const FEATURE_KEYS = ["f1", "f2", "f3", "f4", "f5"] as const;

export default async function ShopModelPage({ params }: { params: Params }) {
  const { locale, model } = await params;
  setRequestLocale(locale);
  const product = findShopProduct(model);
  if (!product) notFound();

  const t = await getTranslations("ShopProduct");
  const tCat = await getTranslations("ShopCatalog");
  const tShop = await getTranslations("Shop");

  const features = FEATURE_KEYS.filter((k) => tCat.has(`${product.id}.features.${k}`)).map((k) =>
    tCat(`${product.id}.features.${k}`),
  );

  // Описание и плюсы собираем здесь, на сервере: это просто текст, и тащить
  // его в клиентский компонент ради отрисовки незачем.
  const details = (
    <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
      <h2 className="text-xl font-bold sm:text-2xl">{t("aboutTitle")}</h2>
      <p className="mt-3 text-muted">{tCat(`${product.id}.description`)}</p>
      {features.length > 0 && (
        <ul className="mt-5 space-y-2.5">
          {features.map((f) => (
            <li key={f} className="flex gap-2.5">
              <IconCheck aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  // Аксессуары к этой доске — внизу страницы доски. К аксессуару в ответ ничего
  // не подсовываем: человек пришёл за конкретной вещью.
  const related =
    product.category === "efoil" ? shopAccessories.filter((a) => a.fits.includes(product.line)) : [];

  return (
    <>
      <Section pad="tight" className="pt-6 sm:pt-10">
        <Container>
          <Link
            href="/shop"
            className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary-strong"
          >
            <IconArrowRight aria-hidden className="h-4 w-4 rotate-180" />
            {t("back")}
          </Link>
          {product.category === "efoil" ? (
            <EfoilConfigurator
              product={product}
              tagline={tCat(`${product.id}.tagline`)}
              details={details}
            />
          ) : (
            <AccessoryConfigurator
              product={product}
              tagline={tCat(`${product.id}.tagline`)}
              details={details}
            />
          )}
        </Container>
      </Section>

      {related.length > 0 && (
        <Section pad="tight" tone="muted">
          <Container>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 className="text-2xl font-bold sm:text-3xl">{t("relatedTitle")}</h2>
              <Link
                href="/shop#accessories"
                className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:text-primary-strong"
              >
                {t("allAccessories")} <IconArrowRight aria-hidden className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {related.slice(0, 5).map((a) => (
                <AccessoryCard
                  key={a.id}
                  product={a}
                  price={
                    pricesVary(a)
                      ? tShop("from", { price: formatUsd(priceFrom(a)) })
                      : formatUsd(priceFrom(a))
                  }
                />
              ))}
            </div>
          </Container>
        </Section>
      )}
    </>
  );
}
