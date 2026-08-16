"use client";

import { formatVnd } from "@/content/services";
import { agentDiscountFor } from "@/lib/agentTerms";
import { useAgentRef } from "./useAgentRef";

// Цена услуги, которая сама показывает агентскую скидку.
//
// Зачем отдельный компонент: страницы прайса и обучения собираются на сервере и
// кэшируются, а скидка зависит от того, что лежит в браузере КОНКРЕТНОГО гостя
// (реф-код, см. lib/attribution). Поэтому цена — маленький клиентский островок
// внутри серверной карточки: пока код не подтверждён сервером, стоит обычная
// цена, а у пришедшего по ссылке агента она превращается в «было → стало».
//
// Скидка есть не у всех услуг: суммы лежат в lib/agentTerms, у остальных
// вернётся 0 и карточка останется обычной.
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
  const byAgent = useAgentRef();
  const discount = byAgent ? agentDiscountFor(code) : 0;

  if (price === null || discount <= 0) {
    return <span className={className}>{formatVnd(price)}</span>;
  }

  return (
    <>
      <span className={oldClassName}>{formatVnd(price)}</span>
      <span className={className}>{formatVnd(Math.max(0, price - discount))}</span>
    </>
  );
}

// Подпись под ценой: «−100 000 ₫ по ссылке агента». Отдельно от самой цены,
// потому что в прайсе она встаёт под названием услуги, а в карточке формата —
// под ценой.
export function AgentDiscountNote({
  code,
  className = "",
}: {
  code?: string | null;
  className?: string;
}) {
  const byAgent = useAgentRef();
  const discount = byAgent ? agentDiscountFor(code) : 0;
  if (discount <= 0) return null;
  return (
    <span className={className}>−{formatVnd(discount)} по ссылке агента</span>
  );
}
