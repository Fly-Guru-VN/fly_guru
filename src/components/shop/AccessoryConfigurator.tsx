"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { ShopAccessory } from "@/content/shop";
import { formatUsd, shopNotes } from "@/lib/shop";
import { ShopBuyButton } from "./ShopBuyButton";
import { ShopGallery } from "./ShopGallery";

// Страница аксессуара: то же устройство, что у доски, но короче — вместо
// размера и цвета здесь максимум один выбор (высота мотора, размер Blowfish,
// версия рюкзака), а у большинства товаров нет и его.
export function AccessoryConfigurator({
  product,
  tagline,
  details,
}: {
  product: ShopAccessory;
  tagline: string;
  details: ReactNode;
}) {
  const t = useTranslations("ShopProduct");
  const [variantId, setVariantId] = useState(product.variants[0].id);
  const variant = product.variants.find((v) => v.id === variantId) ?? product.variants[0];
  const notes = shopNotes(product);
  const title = [product.name, variant.label].filter(Boolean).join(" ");

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-12">
      <div className="lg:sticky lg:top-24 lg:self-start">
        <ShopGallery images={variant.images} alt={title} priority />
      </div>

      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">{product.brand}</p>
        <h1 className="mt-2 text-3xl font-bold leading-tight sm:text-4xl">{product.name}</h1>
        <p className="mt-2 text-lg text-muted">{tagline}</p>

        <p className="mt-6 text-3xl font-bold">{formatUsd(variant.priceUsd)}</p>
        <p className="mt-1 text-sm text-muted">{t(notes.price)}</p>

        {product.variants.length > 1 && (
          <fieldset className="mt-7">
            <legend className="text-sm font-semibold">{t("variant")}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {product.variants.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVariantId(v.id)}
                  aria-pressed={v.id === variant.id}
                  className={`rounded-2xl border px-4 py-2.5 font-semibold transition-colors ${
                    v.id === variant.id
                      ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                      : "border-line bg-surface hover:border-primary/50"
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <p className="mt-6 text-sm">
          <span className="text-muted">{t("fits")}: </span>
          <span className="font-semibold">{product.fits.join(", ")}</span>
        </p>

        <div className="mt-7">
          <ShopBuyButton
            selection={{ productId: product.id, variantId: variant.id }}
            image={variant.images[0]}
            place="product"
            className="w-full sm:w-auto"
          >
            {t("buy")}
          </ShopBuyButton>
        </div>

        <div className="mt-10">{details}</div>
      </div>
    </div>
  );
}
