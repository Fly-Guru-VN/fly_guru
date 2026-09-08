// Единственное место, где перечислены языки сайта.
//
// Файл намеренно БЕЗ импортов. Его читают сразу три разных мира: сборка
// (next.config.ts), сервер (routing.ts, sitemap, robots) и браузер
// (переключатель языка в шапке). Импорт next-intl отсюда сломал бы next.config,
// который выполняется до того, как приложение вообще собрано.
//
// Набор языков выбран по реальному турпотоку в Нячанг, а не по «популярности
// языка вообще»: корейцы и китайцы — первые два иностранных рынка Кханьхоа,
// вьетнамский нужен местным и внутреннему туризму, английский закрывает всех
// остальных (Европа, Индия, Австралия, Малайзия), испанский и немецкий —
// глобальный охват и платёжеспособная Европа. Казахский, тайский и хинди не
// заводим намеренно: их аудитория читает по-русски или по-английски.
export const LOCALES = ["ru", "en", "vi", "ko", "zh", "es", "de"] as const;

export type AppLocale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "ru";

// Языки, у которых в адресе есть префикс. У русского его нет (localePrefix:
// "as-needed"), поэтому старые ссылки, визитки и QR-коды агентов продолжают
// работать: /training так и остаётся /training.
export const PREFIXED_LOCALES = LOCALES.filter((l) => l !== DEFAULT_LOCALE);

// Название языка НА САМОМ ЭТОМ ЯЗЫКЕ. Немец ищет глазами «Deutsch», а не
// «Немецкий»: список языков — единственное место на сайте, которое человек
// читает ещё до того, как сайт заговорил на его языке.
export const LOCALE_NAMES: Record<AppLocale, string> = {
  ru: "Русский",
  en: "English",
  vi: "Tiếng Việt",
  ko: "한국어",
  zh: "中文",
  es: "Español",
  de: "Deutsch",
};

// Короткая метка рядом с планеткой в шапке — чтобы человек видел, на каком
// языке он сейчас, не открывая список.
export const LOCALE_SHORT: Record<AppLocale, string> = {
  ru: "RU",
  en: "EN",
  vi: "VI",
  ko: "KO",
  zh: "ZH",
  es: "ES",
  de: "DE",
};

// Код для поисковика (hreflang). Отличается от нашего только у китайского:
// в адресе у нас короткое /zh, а Google нужно сказать, что это именно
// упрощённое письмо (материковый Китай, Сингапур), а не традиционное.
export const HREFLANG: Record<AppLocale, string> = {
  ru: "ru",
  en: "en",
  vi: "vi",
  ko: "ko",
  zh: "zh-Hans",
  es: "es",
  de: "de",
};

// Формат для превью ссылки в мессенджерах (og:locale) — там нужен язык вместе
// со страной.
export const OG_LOCALE: Record<AppLocale, string> = {
  ru: "ru_RU",
  en: "en_US",
  vi: "vi_VN",
  ko: "ko_KR",
  zh: "zh_CN",
  es: "es_ES",
  de: "de_DE",
};

// Путь с языковым префиксом: ("de", "/training") → "/de/training",
// ("ru", "/training") → "/training". Одно правило на sitemap, robots и ссылки.
export function localePath(locale: AppLocale, path: string): string {
  const clean = path === "/" ? "" : path;
  return locale === DEFAULT_LOCALE ? clean || "/" : `/${locale}${clean}`;
}
