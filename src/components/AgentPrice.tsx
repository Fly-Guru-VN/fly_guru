"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatPrice } from "@/lib/serviceText";
import { refDiscountFor, refDiscountRowKey, useRefOffer } from "./useRefOffer";

// Цена услуги, которая сама показывает агентскую скидку.
//
// Зачем отдельный компонент: страницы прайса и обучения собираются на сервере и
// кэшируются, а скидка зависит от того, что лежит в браузере КОНКРЕТНОГО гостя
// (реф-код, см. lib/attribution). Поэтому цена — маленький клиентский островок
// внутри серверной карточки: пока код не подтверждён сервером, стоит обычная
// цена, а у пришедшего по ссылке агента она превращается в «было → стало».
//
// Скидка есть не у всех услуг: условия лежат в lib/agentTerms, у остальных
// вернётся 0 и карточка останется обычной. Размер зависит от тарифа агента —
// useRefOffer отдаёт именно его (у одного партнёра свои проценты). С 09.10.2026
// так же показывается скидка друга члена клуба — только на абонемент.
export function AgentPrice({
  price,
  code,
  className = "",
  oldClassName = "text-sm text-muted line-through",
}: {
  price: number | null;
  code?: string | null;
  className?: string; // оформление главной (итоговой) цены — задаёт карточка
  oldClassName?: string; // зачёркнутая старая цена
}) {
  const locale = useLocale();
  const t = useTranslations("Common");
  const money = (v: number | null) => formatPrice(locale, v, t("onRequest"));
  const offer = useRefOffer();
  const discount = refDiscountFor(code, price, offer);

  if (price === null || discount <= 0) {
    return <span className={className}>{money(price)}</span>;
  }

  return (
    <>
      <span className={oldClassName}>{money(price)}</span>
      <span className={className}>{money(Math.max(0, price - discount))}</span>
    </>
  );
}

// Подпись под ценой: «−100 000 ₫ по ссылке агента». Отдельно от самой цены,
// потому что в прайсе она встаёт под названием услуги, а в карточке формата —
// под ценой.
export function AgentDiscountNote({
  code,
  price,
  className = "",
}: {
  code?: string | null;
  price: number | null; // нужна процентному тарифу: «−5%» без цены не посчитать
  className?: string;
}) {
  // Формулировка та же, что в форме записи, — и лежит там же (раздел Booking).
  const t = useTranslations("Booking");
  const locale = useLocale();
  const tCommon = useTranslations("Common");
  const offer = useRefOffer();
  const discount = refDiscountFor(code, price, offer);
  if (discount <= 0) return null;
  return (
    <span className={className}>
      {t(refDiscountRowKey(offer), {
        amount: formatPrice(locale, discount, tCommon("onRequest")),
      })}
    </span>
  );
}
