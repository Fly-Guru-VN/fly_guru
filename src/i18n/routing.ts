import { defineRouting } from "next-intl/routing";

// Единое место конфигурации языков.
// Пока сайт только на русском. Поэтому localePrefix: "never": публичные URL
// всегда остаются чистыми (/training), а middleware лишь внутренне переписывает
// их на сегмент [locale]. Режим "as-needed" при одном языке на Next 16.3 создавал
// цикл: / переписывался на /ru, после чего canonical redirect возвращал его на /.
//
// Английский и вьетнамский убраны намеренно: тексты страниц захардкожены
// по-русски, и с ними в списке гость с англоязычным браузером видел бы русскую
// страницу под видом перевода. Файлы messages/en.json и messages/vi.json
// оставлены. Когда появятся реальные переводы, верни языки в locales, а
// localePrefix переключи обратно на "as-needed".
export const routing = defineRouting({
  locales: ["ru"],
  defaultLocale: "ru",
  localePrefix: "never",
});
