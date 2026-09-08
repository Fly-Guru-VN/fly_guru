import { defineRouting } from "next-intl/routing";
import { DEFAULT_LOCALE, LOCALES } from "./locales";

// Единое место конфигурации языков (сам список — в ./locales.ts).
//
// localePrefix: "as-needed" — русский живёт на чистых адресах (/training), все
// остальные языки получают префикс (/de/training). Так старые ссылки, визитки
// и QR-коды агентов продолжают работать, а поисковик видит семь отдельных
// страниц вместо одной.
//
// ⚠️ Грабли, на которые уже наступали: при "as-needed" next-intl канонизирует
// /ru/training обратно в /training редиректом, а Next 16.3 повторно вызывает
// proxy после своего внутреннего rewrite. Без защиты в src/proxy.ts (проверка
// заголовка x-next-intl-locale) это давало вечный 307 на главной. Не убирай
// её и не запускай intlMiddleware дважды.
//
// localeDetection включён: гость с немецким браузером при ПЕРВОМ заходе
// уезжает на /de. Иначе китаец видит кириллицу и закрывает вкладку, не
// долистав до планетки. Определяем только по заголовку Accept-Language;
// поисковые роботы его не шлют и получают русскую версию, а остальные языки
// находят по alternate-ссылкам, которые next-intl проставляет сам.
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "as-needed",
  localeDetection: true,
  // Ручной выбор планеткой должен бить автоопределение — и не на один визит,
  // а насовсем. Куку next-intl ставит сам при переходе на другой язык.
  localeCookie: {
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  },
});
