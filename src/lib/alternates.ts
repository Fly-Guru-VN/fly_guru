import type { Metadata } from "next";
import {
  DEFAULT_LOCALE,
  HREFLANG,
  LOCALES,
  isAppLocale,
  localePath,
} from "@/i18n/locales";
import { SITE_URL } from "@/lib/site";

// canonical + hreflang-ссылки страницы.
//
// canonical — «мой настоящий адрес вот этот». Без него Google сам выбирает
// главный вариант среди /training, /training?utm=…, /ru/training и т.п. и
// помечает остальные копиями, а иногда выбирает не тот. У каждой языковой
// версии canonical указывает НА САМУ СЕБЯ: /de/training не копия /training, а
// отдельная страница, иначе немецкая версия выпала бы из выдачи.
//
// hreflang — «эта же страница на других языках». Без них Google видит
// /training и /de/training как два похожих документа и решает сам, какой
// показывать — обычно один, всем подряд. С ними немцу показывает немецкую
// версию, а корейцу корейскую.
//
// Почему в каждой странице, а не один раз в layout: метаданные наследуются
// сверху вниз, и общий набор в layout проставил бы КАЖДОЙ странице canonical на
// главную — то есть попросил бы Google выкинуть из индекса весь сайт, кроме неё.
export function localeAlternates(
  locale: string,
  path: string,
): Metadata["alternates"] {
  const current = isAppLocale(locale) ? locale : DEFAULT_LOCALE;
  return {
    canonical: `${SITE_URL}${localePath(current, path)}`,
    languages: {
      ...Object.fromEntries(
        LOCALES.map((l) => [HREFLANG[l], `${SITE_URL}${localePath(l, path)}`]),
      ),
      // Для языков, которых у нас нет вовсе (японец, араб), поисковик должен
      // предложить что-то одно — отдаём версию по умолчанию.
      "x-default": `${SITE_URL}${localePath(DEFAULT_LOCALE, path)}`,
    },
  };
}
