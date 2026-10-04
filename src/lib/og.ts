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
//
// Пост журнала (0064) — исключение из «картинка рисуется скриптом»: превью
// поста — его обложка из бакета (cover), и тип страницы — article с датами.
export function ogMeta({
  locale,
  title,
  description,
  page,
  product,
  cover,
  article,
}: {
  locale: string;
  title: string;
  description: string;
  page?: "training" | "tandem" | "club" | "prices" | "reviews" | "contacts" | "shop" | "journal";
  product?: string;
  cover?: { url: string; width: number; height: number };
  article?: { publishedTime: string; modifiedTime: string };
}): Pick<Metadata, "openGraph" | "twitter"> {
  const appLocale = isAppLocale(locale) ? locale : DEFAULT_LOCALE;
  const image = cover
    ? cover
    : {
        url: product
          ? `/og/product/${product}.jpg`
          : page
            ? `/og/${page}/${appLocale}.jpg`
            : `/og/${appLocale}.jpg`,
        width: 1200,
        height: 630,
      };

  return {
    openGraph: {
      ...(article
        ? { type: "article" as const, ...article }
        : { type: "website" as const }),
      siteName: "FlyGuru",
      locale: OG_LOCALE[appLocale],
      title,
      description,
      images: [{ ...image, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image.url],
    },
  };
}
