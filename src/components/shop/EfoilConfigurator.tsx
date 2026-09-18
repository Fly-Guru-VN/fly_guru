"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { ShopEfoil, ShopSetup } from "@/content/shop";
import { efoilImages, formatUsd, shopNotes } from "@/lib/shop";
import { BookBtn } from "../BookBtn";
import { Badge } from "../ui";
import { ShopBuyButton } from "./ShopBuyButton";
import { ShopGallery } from "./ShopGallery";

// Страница доски целиком зависит от двух выборов гостя — размера и цвета: от
// них меняются фото, цена, характеристики и комплектация. Поэтому всё это
// живёт в одном клиентском компоненте, а страница-сервер только передаёт
// справочник и готовые тексты (описание и плюсы — в слоте details).

const SETUP_ROWS: (keyof ShopSetup)[] = [
  "mast",
  "propeller",
  "frontWing",
  "backWing",
  "battery",
  "controller",
];

export function EfoilConfigurator({
  product,
  tagline,
  details,
}: {
  product: ShopEfoil;
  tagline: string;
  details: ReactNode;
}) {
  const t = useTranslations("ShopProduct");
  const [sizeId, setSizeId] = useState(product.defaultSizeId);
  const [colorId, setColorId] = useState(product.colors[0].id);

  const size = product.sizes.find((s) => s.id === sizeId) ?? product.sizes[0];
  const color = product.colors.find((c) => c.id === colorId) ?? product.colors[0];
  const images = efoilImages(product, size.id, color.id);
  const title = `${product.name} ${size.label}, ${color.name}`;
  const notes = shopNotes(product);

  // Время на моторе Hobbywing не сообщил — плашку просто не показываем, а не
  // подставляем красивую цифру.
  const facts = [
    ...(product.rideMinutes
      ? [{ label: t("facts.ride"), value: t("facts.minutes", { minutes: product.rideMinutes }) }]
      : []),
    { label: t("facts.volume"), value: t("facts.liters", { liters: size.volumeL }) },
    { label: t("facts.board"), value: t("facts.cm", { cm: size.dimensionsCm }) },
    { label: t("facts.setup"), value: t("facts.kg", { kg: size.setupKg }) },
  ];

  return (
    <>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-12">
        {/* Галерея прилипает к верху на ПК: справа длинная колонка выбора, и
            без этого, листая до кнопки, человек терял доску из виду. */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <ShopGallery images={images} alt={title} priority />
        </div>

        <div>
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold uppercase tracking-wide text-primary">
            {product.brand}
            {product.limited && <Badge>{t("limited")}</Badge>}
          </p>
          <h1 className="mt-2 text-3xl font-bold leading-tight sm:text-4xl">{product.name}</h1>
          <p className="mt-2 text-lg text-muted">{tagline}</p>

          <p className="mt-6 text-3xl font-bold">{formatUsd(size.priceUsd)}</p>
          <p className="mt-1 text-sm text-muted">{t(notes.price)}</p>

          {/* Размер — главный выбор: под каждым сразу вес райдера, на который
              он рассчитан. Это и есть «подобрать доску под свой вес». */}
          <fieldset className="mt-7">
            <legend className="text-sm font-semibold">{t("size")}</legend>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {product.sizes.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSizeId(s.id)}
                  aria-pressed={s.id === size.id}
                  className={`rounded-2xl border px-3 py-2.5 text-left transition-colors ${
                    s.id === size.id
                      ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                      : "border-line bg-surface hover:border-primary/50"
                  }`}
                >
                  <span className="block font-semibold">{s.label}</span>
                  {s.maxRiderKg && (
                    <span className="block text-xs text-muted">
                      {t("riderUpTo", { kg: s.maxRiderKg })}
                    </span>
                  )}
                </button>
              ))}
            </div>
            {size.maxRiderBlowfishKg && (
              <p className="mt-2 text-xs text-muted">
                {t("riderBlowfish", { kg: size.maxRiderBlowfishKg })}
              </p>
            )}
          </fieldset>

          <fieldset className="mt-6">
            <legend className="text-sm font-semibold">
              {t("color")}: <span className="font-normal text-muted">{color.name}</span>
            </legend>
            <div className="mt-3 flex flex-wrap gap-3">
              {product.colors.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setColorId(c.id)}
                  aria-label={c.name}
                  aria-pressed={c.id === color.id}
                  title={c.name}
                  style={{ backgroundColor: c.hex }}
                  className={`h-9 w-9 rounded-full border border-black/15 transition-shadow ${
                    c.id === color.id ? "ring-2 ring-primary ring-offset-2" : "hover:ring-2 hover:ring-line hover:ring-offset-2"
                  }`}
                />
              ))}
            </div>
          </fieldset>

          <dl className="mt-7 grid grid-cols-2 gap-3">
            {facts.map((f) => (
              <div key={f.label} className="rounded-2xl bg-surface-2 px-4 py-3">
                <dt className="text-xs text-muted">{f.label}</dt>
                <dd className="mt-0.5 font-bold">{f.value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <ShopBuyButton
              selection={{ productId: product.id, sizeId: size.id, colorId: color.id }}
              image={images[0]}
              place="product"
              className="w-full sm:w-auto"
            >
              {t("buy")}
            </ShopBuyButton>
            {/* Главный козырь школы перед интернет-магазином: электрофойл
                можно попробовать до покупки. Открывает обычную запись на урок. */}
            <BookBtn place="shop-product" variant="secondary" size="lg" className="w-full sm:w-auto">
              {t("tryFirst")}
            </BookBtn>
          </div>
        </div>
      </div>

      <div className="mt-12 grid items-start gap-6 lg:mt-16 lg:grid-cols-2">
        <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
          <h2 className="text-xl font-bold sm:text-2xl">
            {t("includedTitle")} <span className="text-muted">· {size.label}</span>
          </h2>
          <dl className="mt-4 divide-y divide-line">
            {SETUP_ROWS.filter((row) => size.setup[row]).map((row) => (
              <div key={row} className="flex items-baseline justify-between gap-4 py-2.5">
                <dt className="text-sm text-muted">{t(`setup.${row}`)}</dt>
                <dd className="text-right text-sm font-semibold">{size.setup[row]}</dd>
              </div>
            ))}
          </dl>
          {notes.alsoIncluded && (
            <p className="mt-4 text-sm text-muted">{t(notes.alsoIncluded)}</p>
          )}
          <p className="mt-3 text-xs text-muted">{t(notes.setup)}</p>
        </section>
        <div>{details}</div>
      </div>
    </>
  );
}
