import type { Metadata } from "next";
import { DEFAULT_LOCALE, HREFLANG, LOCALES, localePath } from "@/i18n/locales";
import { SITE_URL } from "@/lib/site";

// hreflang-ссылки страницы: «эта же страница на других языках».
//
// Зачем. Без них Google видит /training и /de/training как два похожих
// документа и решает сам, какой показывать — обычно один, всем подряд. С ними
// он показывает немцу немецкую версию, а корейцу корейскую, и ни одна из
// версий не считается двойником другой.
//
// Почему в каждой странице, а не один раз в layout: метаданные наследуются
// сверху вниз, и общий набор в layout проставил бы КАЖДОЙ странице ссылки на
// главную. Набор языков от локали не зависит (он у страницы один и тот же на
// всех языках), поэтому статичного metadata в странице достаточно.
export function localeAlternates(path: string): Metadata["alternates"] {
  return {
    languages: {
      ...Object.fromEntries(
        LOCALES.map((locale) => [
          HREFLANG[locale],
          `${SITE_URL}${localePath(locale, path)}`,
        ]),
      ),
      // Для языков, которых у нас нет вовсе (японец, араб), поисковик должен
      // предложить что-то одно — отдаём версию по умолчанию.
      "x-default": `${SITE_URL}${localePath(DEFAULT_LOCALE, path)}`,
    },
  };
}
