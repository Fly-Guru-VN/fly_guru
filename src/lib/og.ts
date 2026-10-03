import type { Metadata } from "next";
import { DEFAULT_LOCALE, OG_LOCALE, isAppLocale } from "@/i18n/locales";

// Превью ссылки в мессенджере (og:* и twitter:*) для одной страницы.
//
// Картинки рисует scripts/make-og.mjs: главная — /og/<язык>.jpg, разделы —
// /og/<раздел>/<язык>.jpg, товары — /og/product/<товар>.jpg (одна на все
// языки). Новый раздел — сначала добавить его в PAGES скрипта и прогнать его.
//
// Почему набор собирается целиком, а не «добавить картинку»: Next сливает
// метаданные страницы с layout только по верхним ключам. Страница, задавшая
// openGraph хоть с одним полем, теряет всё остальное из layout — картинку,
// siteName, og:locale, — и превью уходит без картинки.
//
// og:url намеренно не ставим: мессенджер берёт адрес, который ему прислали, а
// поисковик смотрит на canonical страницы (localeAlternates).
export function ogMeta({
  locale,
  title,
  description,
  page,
  product,
}: {
  locale: string;
  title: string;
  description: string;
  page?: "training" | "tandem" | "club" | "prices" | "reviews" | "contacts" | "shop";
  product?: string;
}): Pick<Metadata, "openGraph" | "twitter"> {
  const appLocale = isAppLocale(locale) ? locale : DEFAULT_LOCALE;
  const image = product
    ? `/og/product/${product}.jpg`
    : page
      ? `/og/${page}/${appLocale}.jpg`
      : `/og/${appLocale}.jpg`;

  return {
    openGraph: {
      type: "website",
      siteName: "FlyGuru",
      locale: OG_LOCALE[appLocale],
      title,
      description,
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}
