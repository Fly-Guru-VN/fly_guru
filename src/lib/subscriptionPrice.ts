// Цена абонемента по умолчанию (решение начальника от 06.10.2026): клиенту,
// который уже в клубе (строка в memberships — её заводит откатанный абонемент,
// 0061), повторный абонемент стоит 5 000 000 ₫ вместо 6 000 000 ₫.
//
// «По умолчанию» — значит, когда цену не вписали руками. Свою цену по-прежнему
// ставят только начальник и David (isAdminLike), и она важнее этого правила.
// Модуль без зависимостей: цифры показывают и формы в браузере.
export const SUBSCRIPTION_PRICE = 6_000_000;
export const MEMBER_SUBSCRIPTION_PRICE = 5_000_000;

export function subscriptionPriceFor(isMember: boolean): number {
  return isMember ? MEMBER_SUBSCRIPTION_PRICE : SUBSCRIPTION_PRICE;
}
