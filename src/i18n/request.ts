import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";

// Вызывается на каждый запрос: определяет активную локаль и подгружает
// соответствующий JSON-файл с сообщениями из папки /messages.

type Messages = { [key: string]: string | Messages };

// Слияние «перевод поверх русского». Нужно, пока переводы делаются по кускам:
// непереведённая фраза показывается по-русски, а не падает ошибкой и не зияет
// пустым местом. Слияние именно ГЛУБОКОЕ: у наполовину переведённого раздела
// иначе пропали бы все нетронутые ключи.
function mergeMessages(base: Messages, overrides: Messages): Messages {
  const result: Messages = { ...base };

  for (const [key, value] of Object.entries(overrides)) {
    const current = result[key];
    result[key] =
      typeof value === "object" && typeof current === "object"
        ? mergeMessages(current, value)
        : value;
  }

  return result;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  const fallback = (await import("../../messages/ru.json")).default as Messages;
  const messages =
    locale === routing.defaultLocale
      ? fallback
      : mergeMessages(
          fallback,
          (await import(`../../messages/${locale}.json`)).default as Messages,
        );

  return { locale, messages };
});
