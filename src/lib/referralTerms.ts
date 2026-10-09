// Условия реферальной ссылки клиента. С 09.10.2026 — новые (решение начальника,
// уточнения David от 09.10.2026), прежние «+20 рефу, +10 другу» отменены.
//
// Простыми словами: член клуба делится ссылкой. Если друг — НОВЫЙ клиент
// (карточка заводится этой записью) и сразу берёт одну из трёх услуг, рефу
// начисляются бонусные минуты: взрослый тандем +10, взрослое базовое +20,
// абонемент +30. Решает ПЕРВАЯ покупка: пришёл на прокат — реф не получает
// ничего и потом тоже. Другу скидка только одна: −1 000 000 ₫ на абонемент, и
// только если абонемент — его первая покупка.
//
// ЭТОТ ФАЙЛ ЧИТАЮТ И СЕРВЕР, И БРАУЗЕР: только числа и чистые функции. Всё, что
// требует базы (кто член клуба, новый ли клиент, остаток), — в lib/referrals.

/** Бонусные минуты рефу за друга — по коду услуги его первой покупки. */
export const REFERRER_REWARD_BY_SERVICE: Readonly<Record<string, number>> = {
  "tandem-adult": 10,
  "basic-adult": 20,
  subscription: 30,
};

/**
 * Сколько минут получит реф, если друг первой покупкой взял эту услугу.
 * Абонемент узнаём и по категории: продажа абонемента идёт своей формой, без
 * выбора услуги. Всё остальное (детские, парное, прокат, туры) — 0.
 */
export function referrerRewardFor(
  serviceCode: string | null | undefined,
  category?: string | null,
): number {
  if (category === "subscription") return REFERRER_REWARD_BY_SERVICE.subscription;
  return (serviceCode && REFERRER_REWARD_BY_SERVICE[serviceCode]) || 0;
}

/** Скидка другу на абонемент, ₫. */
export const FRIEND_SUBSCRIPTION_DISCOUNT = 1_000_000;

/** Цена абонемента для нового друга по ссылке: минус скидка, не ниже нуля. */
export function friendSubscriptionPrice(price: number): number {
  return Math.max(0, price - FRIEND_SUBSCRIPTION_DISCOUNT);
}

/** Самая большая награда — для подписи «до 30 минут» в кабинете. */
export const REFERRER_REWARD_MAX = Math.max(
  ...Object.values(REFERRER_REWARD_BY_SERVICE),
);

/** services.code услуги, которой тратят бонусные минуты (миграция 0063). */
export const BONUS_SERVICE_CODE = "bonus-minutes";
