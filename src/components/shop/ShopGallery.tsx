"use client";

import Image from "next/image";
import { useState } from "react";

// Галерея товара: большое фото и полоска миниатюр под ним. Рендеры Lift на
// белом, поэтому и подложка белая — иначе вокруг доски проступал бы квадрат.
//
// Номер открытого фото переживает смену цвета: смотрел доску сбоку, нажал
// другой цвет — остался сбоку, а не вернулся к первому ракурсу.
export function ShopGallery({
  images,
  alt,
  priority = false,
}: {
  images: string[];
  alt: string; // «LIFT5 4'9 Sport, Steel Blue» — номер фото допишем сами
  priority?: boolean;
}) {
  const [active, setActive] = useState(0);
  const current = Math.min(active, images.length - 1);

  return (
    <div>
      <div className="relative aspect-square overflow-hidden rounded-3xl border border-line bg-white">
        <Image
          key={images[current]}
          src={images[current]}
          alt={alt}
          fill
          priority={priority}
          sizes="(min-width: 1024px) 560px, 100vw"
          className="animate-fade-in object-contain"
        />
      </div>
      {images.length > 1 && (
        <div className="mt-3 flex gap-2">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`${alt} — ${i + 1}`}
              aria-pressed={i === current}
              className={`relative h-16 w-16 overflow-hidden rounded-xl border bg-white transition-colors sm:h-20 sm:w-20 ${
                i === current ? "border-primary ring-2 ring-primary/25" : "border-line hover:border-primary/50"
              }`}
            >
              <Image src={src} alt="" fill sizes="80px" className="object-contain" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
