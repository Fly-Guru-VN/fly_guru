// Экскурсии и сафари — туры (категория услуги «tour»). Правила начальника от
// 06.10.2026, отдельные от обычных занятий:
//
//  • Marina Beach с тура НЕ получает ничего: катаемся не у неё, все деньги —
//    FlyGuru. 2% CRM (David + СММщик) с туров при этом берутся как со всего.
//  • В общий котёл 15% дня тур не идёт вовсе.
//  • Вёз инструктор (любой из полевого состава) — фикс ЗА ВЫЕЗД, а не за
//    человека: экскурсия, в том числе детская, 1 000 000 ₫, сафари 1 500 000 ₫.
//  • Вёз начальник — сотрудникам ничего, деньги остаются школе.
//  • Цена: взрослая экскурсия от двух человек — по 3 000 000 ₫ с каждого вместо
//    3 500 000 ₫. У сафари и детской экскурсии групповой цены нет. Клубной цены
//    на туры нет: их и так берут только члены клуба (кроме исключений).
//
// Один тур = одна сессия: в ней контактное лицо, кто вёз, число людей и сумма
// за всех. Поэтому фикс считается по числу сессий-туров, а не по людям.
//
// Модуль без зависимостей: формы в браузере считают по нему ту же цену.
export const TOUR_CATEGORY = "tour";

export const TOUR_PAY = 1_000_000; // ₫ за выезд на экскурсию (и детскую)
export const SAFARI_PAY = 1_500_000; // ₫ за выезд на сафари

export const EXCURSION_GROUP_FROM = 2; // со скольких человек групповая цена
export const EXCURSION_GROUP_PRICE = 3_000_000; // ₫ с человека в группе

export const TOURS_MAX_PEOPLE = 10; // защита от опечатки «20» вместо «2»

export function isTour(category: string | null | undefined): boolean {
  return category === TOUR_CATEGORY;
}

/** Сколько получает инструктор за выезд. Новый тур без своего правила — как экскурсия. */
export function tourPayFor(code: string | null | undefined): number {
  return code === "safari" ? SAFARI_PAY : TOUR_PAY;
}

/** Цена с одного человека: у взрослой экскурсии от двух — групповая. */
export function tourPricePerPerson(
  code: string | null | undefined,
  listPrice: number,
  people: number,
): number {
  if (code === "excursion" && people >= EXCURSION_GROUP_FROM) {
    return EXCURSION_GROUP_PRICE;
  }
  return listPrice;
}

/** Сумма за весь выезд по прайсу. */
export function tourTotal(
  code: string | null | undefined,
  listPrice: number,
  people: number,
): number {
  return tourPricePerPerson(code, listPrice, people) * people;
}

/** Число людей из формы: мусор и выход за 1…TOURS_MAX_PEOPLE — ошибка (null). */
export function parsePeople(raw: unknown): number | null {
  const n = Number(String(raw ?? "").trim() || "1");
  if (!Number.isInteger(n) || n < 1 || n > TOURS_MAX_PEOPLE) return null;
  return n;
}
