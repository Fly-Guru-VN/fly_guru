import { localePath, type AppLocale } from "@/i18n/locales";

// Адреса старого сайта flyguru.pro (до июля 2026) → ближайшая страница нового.
//
// Зачем. До нынешнего сайта на домене жил другой: статьи, услуги по локациям,
// магазин досок Hobbywing, семь языков. Google запомнил около 670 его адресов,
// и все они стали отдавать 404 — вместе с ними из выдачи ушли почти все показы
// (Search Console, сентябрь 2026). Постоянный редирект говорит поисковику
// «страница переехала сюда»: он переносит накопленный вес на новый адрес, а
// человек по старой ссылке попадает на живую страницу, а не на ошибку.
//
// Правила (решение David, 17.09.2026):
// • редиректим только ПО СМЫСЛУ. Сотни разных адресов на одну главную Google
//   считает «ложной 404» и не переносит ничего;
// • Сочи НЕ редиректим: там школа не работает, и вести сочинский запрос на
//   Нячанг — обман человека. Такие адреса остаются 404 и сами выпадут из индекса;
// • статьи ведём на страницу, которая отвечает на тот же вопрос.
//
// Языки старого сайта. Английский жил БЕЗ префикса (в выгрузке 404 нет ни
// одного /en/…), остальные — с префиксом. У нас наоборот: без префикса русский.
// Французского у нас нет — ведём на английский.
const OLD_PREFIXED: Record<string, AppLocale> = {
  ru: "ru",
  en: "en",
  vi: "vi",
  ko: "ko",
  zh: "zh",
  es: "es",
  de: "de",
  fr: "en",
};
const OLD_DEFAULT: AppLocale = "en";

// Разделы старого сайта. Ни один не совпадает с нынешними адресами — это
// проверяет тест, иначе редирект мог бы увести с живой страницы.
export const LEGACY_SECTIONS = [
  "articles",
  "blog",
  "boards",
  "cart",
  "faq",
  "franchise",
  "offer",
  "services",
  "locations",
] as const;

// Точные соответствия: «раздел/адрес» → путь нового сайта.
const EXACT: Record<string, string> = {
  // Услуги
  "services/efoil-training": "/training",
  "services/efoil-training-duo": "/training",
  "services/master-course": "/training",
  "services/kids-efoil-training": "/training",
  "services/tandem-flight": "/tandem",
  "services/kids-tandem-flight": "/tandem",
  "services/efoil-membership-300": "/club",
  "services/independent-ride-after-training": "/prices",
  "services/guided-efoil-excursion": "/prices",
  "services/insta360-photo-video": "/prices",
  "services/nha-trang-marina-catamaran-efoil-tour": "/prices",
  "services/nha-trang-marina-yacht-efoil-tour": "/prices",

  // Статьи про первый опыт и безопасность → «Обучение»
  "articles/first-efoil-lesson": "/training",
  "articles/how-hard-is-efoil-for-beginners": "/training",
  "articles/how-to-fall-on-efoil": "/training",
  "articles/best-conditions-for-first-efoil-ride": "/training",
  "articles/efoil-safety-rules": "/training",
  "articles/efoil-training-safety": "/training",
  "articles/efoil-rules-and-where-you-can-ride": "/training",
  "articles/efoil-for-kids-and-families": "/training",

  // Статьи про выбор, покупку и владение доской → «Магазин»
  "articles/how-to-choose-an-efoil-board": "/shop",
  "articles/efoil-board-size-volume-wing-guide": "/shop",
  "articles/efoil-equipment": "/shop",
  "articles/new-vs-used-efoil": "/shop",
  "articles/rent-or-buy-efoil": "/shop",
  "articles/efoil-battery-range-and-charging": "/shop",
  "articles/can-you-fly-with-efoil-battery": "/shop",
  "articles/efoil-maintenance-after-salt-water": "/shop",
  "articles/efoil-ownership-travel": "/shop",

  // «Что такое eFoil» и сравнения → главная (там видео и основные факты)
  "articles/what-is-efoil-and-how-it-works": "/",
  "articles/efoil-basics": "/",
  "articles/efoil-vs-jetboard-vs-wingfoil": "/",

  "blog/nha-trang-marina-private-efoil-boat-tours": "/prices",
  "blog/photo-album-after-efoil-session": "/reviews",
};

// Всё остальное внутри раздела — по разделу целиком.
const SECTION_FALLBACK: Record<string, string> = {
  articles: "/",
  blog: "/",
  boards: "/shop", // магазин досок (и корзина, и оформление заказа)
  cart: "/shop",
  faq: "/", // вопросы живут на главной
  franchise: "/",
  offer: "/",
  services: "/prices",
};

// Старая локация, которую мы представляем сейчас. Остальные (Сочи) — 404.
const CURRENT_LOCATION = "nha-trang-marina";

// Куда вести старый адрес, или null — это не старый адрес (или Сочи).
export function legacyRedirect(pathname: string): string | null {
  let segments = pathname.split("/").filter(Boolean);
  let locale = OLD_DEFAULT;

  const first = segments[0];
  if (first && first in OLD_PREFIXED) {
    locale = OLD_PREFIXED[first];
    segments = segments.slice(1);
    // Корень французской версии. Корни остальных языков у нас живые.
    if (segments.length === 0) return first === "fr" ? localePath(locale, "/") : null;
  }

  if (segments[0] === "locations") {
    // /locations — список локаций; /locations/nha-trang-marina — страница школы.
    if (segments.length === 1) return localePath(locale, "/");
    if (segments[1] !== CURRENT_LOCATION) return null;
    segments = segments.slice(2);
    if (segments.length === 0) return localePath(locale, "/");
  }

  const section = segments[0];
  if (!section || !(section in SECTION_FALLBACK)) return null;

  const key = segments.slice(0, 2).join("/");
  const target = EXACT[key] ?? SECTION_FALLBACK[section];
  return localePath(locale, target);
}
