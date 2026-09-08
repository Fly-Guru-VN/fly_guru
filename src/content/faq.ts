import type { FaqEntry } from "@/components/Faq";

// Наборы вопросов для страниц. Самих текстов здесь нет: вопрос и ответ живут в
// messages/<язык>.json (раздел Faq), а тут перечислены только ключи и порядок.
//
// Порядок — это содержательное решение («сначала снимаем страх, потом деньги»),
// поэтому он остаётся в коде, а не растворяется в JSON.

export const homeFaqKeys = [
  "experience", // нужен ли опыт
  "safety", // это безопасно
  "gear", // что взять с собой
  "lessons", // сколько занятий до самостоятельного катания
  "age", // с какого возраста
  "doubt", // а если у меня не получится
] as const;

// Сжатый набор для страницы /training — подмножество главного, свой порядок.
export const trainingFaqKeys = ["experience", "lessons", "age", "safety"] as const;

// Вопросы про клуб. Отвечаем только то, что школа реально делает сегодня:
// абонемент, сроки минут, кого берут на выезды. Про уровни, передачу минут и
// «приведи друга» здесь намеренно ни слова — этой механики в CRM ещё нет, а
// обещать несуществующее нельзя.
export const clubFaqKeys = [
  "needTraining",
  "minutesLife",
  "worth",
  "tours",
  "membership",
  "where",
] as const;

// Собирает вопросы для <Faq>: ключи + переводчик раздела (Faq.home / Faq.club).
export function buildFaq(
  keys: readonly string[],
  t: (key: string) => string,
): FaqEntry[] {
  return keys.map((key) => ({ q: t(`${key}.q`), a: t(`${key}.a`) }));
}
