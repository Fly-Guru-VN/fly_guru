import Image from "next/image";
import { Link } from "@/i18n/navigation";
import type { ShopAccessory, ShopEfoil } from "@/content/shop";
import { productCover } from "@/lib/shop";
import { IconArrowRight } from "../icons";
import { Badge } from "../ui";

// Карточки каталога /shop. Серверные: переходить в товар можно и без JS, а
// всё интерактивное (выбор размера, цвета, окно «Купить») живёт уже на
// странице товара.

const cardClass =
  "group flex flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-[0_18px_40px_-30px_rgba(15,34,51,0.45)] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_22px_44px_-26px_rgba(15,34,51,0.5)]";

export function EfoilCard({
  product,
  tagline,
  meta,
  limitedLabel,
  price,
  moreLabel,
}: {
  product: ShopEfoil;
  tagline: string;
  meta: string; // «90 мин на моторе · 3 размера»
  limitedLabel: string;
  price: string; // «$14,999» или «от $…» — решает страница
  moreLabel: string;
}) {
  return (
    <Link href={`/shop/${product.id}`} className={cardClass}>
      <div className="relative aspect-[4/3] bg-white">
        <Image
          src={productCover(product)}
          alt={product.name}
          fill
          sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"
          className="object-contain p-2 transition-transform duration-300 group-hover:scale-[1.03]"
        />
        {product.limited && <Badge className="absolute left-4 top-4">{limitedLabel}</Badge>}
      </div>
      <div className="flex flex-1 flex-col border-t border-line p-5">
        <h3 className="text-xl font-bold">{product.name}</h3>
        <p className="mt-1 text-sm text-muted">{tagline}</p>
        <p className="mt-3 text-xs text-muted">{meta}</p>
        <div className="mt-3 flex gap-1.5" aria-hidden>
          {product.colors.map((c) => (
            <span
              key={c.id}
              title={c.name}
              style={{ backgroundColor: c.hex }}
              className="h-4 w-4 rounded-full border border-black/15"
            />
          ))}
        </div>
        <div className="mt-auto flex items-center justify-between gap-3 pt-5">
          <span className="text-lg font-bold">{price}</span>
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
            {moreLabel} <IconArrowRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}

export function AccessoryCard({
  product,
  price,
}: {
  product: ShopAccessory;
  price: string; // «$85» или «от $599» — решает страница
}) {
  return (
    <Link href={`/shop/${product.id}`} className={cardClass}>
      <div className="relative aspect-square bg-white">
        <Image
          src={productCover(product)}
          alt={product.name}
          fill
          sizes="(min-width: 1024px) 260px, 50vw"
          className="object-contain p-2 transition-transform duration-300 group-hover:scale-[1.03]"
        />
      </div>
      <div className="flex flex-1 flex-col border-t border-line p-4">
        <h3 className="text-sm font-bold leading-snug sm:text-base">{product.name}</h3>
        <p className="mt-auto pt-2 text-sm font-semibold text-muted">{price}</p>
      </div>
    </Link>
  );
}
