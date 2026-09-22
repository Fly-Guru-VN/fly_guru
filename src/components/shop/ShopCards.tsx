import Image from "next/image";
import { Link } from "@/i18n/navigation";
import type { ShopAccessory, ShopEfoil } from "@/content/shop";
import { productCover } from "@/lib/shop";
import { IconArrowRight } from "../icons";

// Карточки каталога /shop. Серверные: переходить в товар можно и без JS, а
// всё интерактивное (выбор размера, цвета, окно «Купить») живёт уже на
// странице товара.
//
// Рендеры товаров лежат на БЕЛОМ фоне (так их отдаёт Lift, и так же приведены
// фото Hobbywing). Серая подложка кадра получается через mix-blend-multiply:
// белое поле картинки берёт цвет подложки, и товар стоит «на столе», а не в
// белом квадрате.

const cardClass =
  "group flex flex-col rounded-3xl border bg-surface p-2.5 shadow-[0_18px_40px_-30px_rgba(15,34,51,0.45)] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_22px_44px_-26px_rgba(15,34,51,0.5)]";

// «Подробнее →» — не отдельная ссылка, а вид кнопки: ссылка — вся карточка.
function MoreButton({ label }: { label: string }) {
  return (
    <span className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-primary/50 py-2.5 text-sm font-semibold text-primary-strong transition-colors group-hover:border-primary group-hover:bg-primary group-hover:text-white">
      {label} <IconArrowRight aria-hidden className="h-4 w-4" />
    </span>
  );
}

function Cover({ src, alt, sizes }: { src: string; alt: string; sizes: string }) {
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      className="object-contain p-3 mix-blend-multiply transition-transform duration-300 group-hover:scale-[1.03]"
    />
  );
}

export function EfoilCard({
  product,
  badge,
  featured = false,
  tagline,
  colorLabel,
  price,
  moreLabel,
}: {
  product: ShopEfoil;
  badge: string; // «Первый eFoil», «Гибрид»… — коротко, для кого доска
  featured?: boolean; // флагман: рамка и оранжевая плашка, как на макете
  tagline: string;
  colorLabel: string;
  price: string; // «$14,999» или «от $…» — решает страница
  moreLabel: string;
}) {
  return (
    <Link
      href={`/shop/${product.id}`}
      className={`${cardClass} ${featured ? "border-primary ring-1 ring-primary" : "border-line"}`}
    >
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-surface-2">
        <Cover
          src={productCover(product)}
          alt={product.name}
          sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"
        />
        <span
          className={`absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-semibold ${
            featured ? "bg-accent/15 text-accent-strong" : "bg-white/85 text-primary-strong"
          }`}
        >
          {badge}
        </span>
      </div>
      <div className="flex flex-1 flex-col px-2.5 pb-2.5 pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{product.brand}</p>
        <h3 className="mt-1 text-2xl font-bold leading-tight">{product.name}</h3>
        <p className="mt-1.5 text-sm text-muted">{tagline}</p>
        <div className="mt-auto flex items-center gap-3 pt-4">
          <span className="text-sm text-muted">{colorLabel}</span>
          <span className="flex flex-wrap gap-1.5" aria-hidden>
            {product.colors.map((c) => (
              <span
                key={c.id}
                title={c.name}
                style={{ backgroundColor: c.hex }}
                className="h-5 w-5 rounded-full border border-black/15"
              />
            ))}
          </span>
        </div>
        <p className="mt-3 text-2xl font-bold text-primary-strong">{price}</p>
        <MoreButton label={moreLabel} />
      </div>
    </Link>
  );
}

export function AccessoryCard({
  product,
  price,
  kindLabel,
  fitsLabel,
  moreLabel,
}: {
  product: ShopAccessory;
  price: string; // «$85» или «от $599» — решает страница
  // Каталог показывает раздел, совместимость и кнопку; в подборке на странице
  // доски карточки мельче, и там их нет — отсюда необязательные подписи.
  kindLabel?: string;
  fitsLabel?: string; // «Подходит к»
  moreLabel?: string;
}) {
  return (
    <Link href={`/shop/${product.id}`} className={`${cardClass} border-line`}>
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-surface-2">
        <Cover
          src={productCover(product)}
          alt={product.name}
          sizes="(min-width: 1024px) 280px, 50vw"
        />
      </div>
      <div className="flex flex-1 flex-col px-1.5 pb-1.5 pt-3 sm:px-2.5 sm:pb-2.5">
        {kindLabel && (
          <span className="self-start rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary-strong">
            {kindLabel}
          </span>
        )}
        <p className={`text-[11px] font-semibold uppercase tracking-wide text-muted ${kindLabel ? "mt-2.5" : ""}`}>
          {product.brand}
        </p>
        <h3 className="mt-0.5 text-sm font-bold leading-snug sm:text-base">{product.name}</h3>
        {fitsLabel && (
          <p className="mt-1 text-xs text-muted">
            {fitsLabel}: {product.fits.join(", ")}
          </p>
        )}
        <p
          className={`mt-auto pt-3 font-bold ${
            moreLabel ? "text-xl text-primary-strong" : "text-sm text-muted"
          }`}
        >
          {price}
        </p>
        {moreLabel && <MoreButton label={moreLabel} />}
      </div>
    </Link>
  );
}
