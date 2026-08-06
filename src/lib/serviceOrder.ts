// Единый порядок услуг «по типажам» для всех выпадающих списков системы.
//
// Зачем: раньше каждая форма сортировала как придётся — где-то по алфавиту
// (и «Абонемент» с «Фото/видео» оказывались выше базового обучения), где-то по
// цене. Инструктор в 9 случаях из 10 записывает базовое обучение, а искать его
// приходилось глазами по всему списку.
//
// Порядок задан по services.code, а не по названию: код у услуги вечен
// (миграции 0010 и 0024), название админ может переписать в любой момент —
// сортировка от этого не поедет.

import type { ServiceCategory } from "@/content/services";

// Порядок групп. Абонемент почти во всех CRM-формах отфильтрован
// (у него своя форма с минутами), но в общем списке место ему тоже нужно.
const CATEGORY_ORDER: ServiceCategory[] = [
  "training",
  "tandem",
  "rental",
  "tour",
  "subscription",
  "extra",
];

// Порядок внутри группы: сначала самое частое, рядом — похожее на него.
const CODE_ORDER: string[] = [
  // Обучение
  "basic-adult",
  "basic-duo",
  "basic-kid",
  "individual-training",
  // Тандем
  "tandem-adult",
  "tandem-kid",
  // Прокат
  "rental",
  // Выезды
  "excursion",
  "safari",
  // Абонемент
  "subscription",
  // Дополнительно
  "video",
  "video-raw",
  "drone",
];

// Минимум, который нужен сортировке. Любая строка услуги из базы подходит,
// лишь бы в select() попали code и category.
export interface SortableService {
  name: string;
  code?: string | null;
  category?: string | null;
}

const LAST = Number.MAX_SAFE_INTEGER;

function categoryRank(category: string | null | undefined): number {
  const i = CATEGORY_ORDER.indexOf(category as ServiceCategory);
  return i === -1 ? LAST : i;
}

function codeRank(code: string | null | undefined): number {
  const i = code ? CODE_ORDER.indexOf(code) : -1;
  return i === -1 ? LAST : i;
}

// Сортировка по типажам. Услуги, созданные админом вручную (у них code пустой),
// не теряются: они встают в конец своей категории по алфавиту.
export function sortServicesByType<T extends SortableService>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const byCategory = categoryRank(a.category) - categoryRank(b.category);
    if (byCategory !== 0) return byCategory;

    const byCode = codeRank(a.code) - codeRank(b.code);
    if (byCode !== 0) return byCode;

    return a.name.localeCompare(b.name, "ru");
  });
}
