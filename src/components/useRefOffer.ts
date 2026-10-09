"use client";

import { useEffect, useState } from "react";
import { getAttributionForBooking } from "@/lib/attribution";
import { agentDiscountFor, asAgentPlan, type AgentPlan } from "@/lib/agentTerms";
import { FRIEND_SUBSCRIPTION_DISCOUNT } from "@/lib/referralTerms";

// «Гость пришёл по живой агентской ссылке — и по чьей?» — один ответ на весь
// сайт.
//
// Код лежит в браузере до 30 дней (lib/attribution), поэтому спросить его можно
// с любой страницы, а не только с лендинга /r/<код>. Но сам по себе код ничего
// не значит: скидку даёт только ссылка активного агента, инструкторская — нет.
// Проверяет это сервер (api/ref/[code]), здесь мы только спрашиваем и держим
// ответ.
//
// Возвращаем ТАРИФ агента (agents.terms_plan, миграция 0046), а не «да/нет»:
// с 17.08.2026 у агентов разные условия, и размер скидки зависит от того, по
// чьей ссылке человек пришёл. null — ссылка не агентская (или ответа ещё нет).
//
// Пока ответа нет — null. То есть по умолчанию сайт молчит про скидку и не
// обещает того, чего может не быть; плашка появляется, когда сервер подтвердил.

//
// С 09.10.2026 скидку даёт и ссылка члена клуба: −1 млн на абонемент новому
// гостю (lib/referralTerms). Поэтому наружу отдаём не только тариф агента, а
// «что даёт эта ссылка» — RefOffer.

export type RefOffer = { kind: "agent"; plan: AgentPlan } | { kind: "client" };

/** Скидка на услугу (по её code) по этой ссылке, ₫. 0 — скидки нет. */
export function refDiscountFor(
  code: string | null | undefined,
  price: number | null,
  offer: RefOffer | null,
): number {
  if (!offer) return 0;
  if (offer.kind === "agent") return agentDiscountFor(code, price, offer.plan);
  if (code !== "subscription" || price === null) return 0;
  return Math.min(price, FRIEND_SUBSCRIPTION_DISCOUNT);
}

/** Ключ подписи «−сумма по ссылке …» в разделе Booking. */
export function refDiscountRowKey(offer: RefOffer | null) {
  return offer?.kind === "client" ? "friendDiscountRow" : "agentDiscountRow";
}

// Ответы не перезапрашиваем на каждое открытие формы: код за сессию не меняется.
// Храним сам ПРОМИС, а не готовый ответ: на прайсе цена — островок в каждой
// карточке (×2 с подписью), и все они спрашивают одновременно, пока ответа ещё
// нет. С кэшем ответов это было полсотни запросов разом, ограничитель адреса
// (30 в минуту) отбивал хвост, и у этих карточек скидка молча не появлялась.
const answers = new Map<string, Promise<RefOffer | null>>();

function lookup(code: string): Promise<RefOffer | null> {
  let answer = answers.get(code);
  if (!answer) {
    answer = fetch(`/api/ref/${encodeURIComponent(code)}`)
      // 404-like `kind:null` можно кэшировать, а 429/503 — временный сбой. Его
      // не превращаем в «скидки нет» навсегда: убираем из кэша, следующий
      // экран спросит заново.
      .then((res) => {
        if (!res.ok) throw new Error(`ref lookup failed: ${res.status}`);
        return res.json();
      })
      .then((data: { kind?: string | null; plan?: string | null }) =>
        data.kind === "agent"
          ? { kind: "agent" as const, plan: asAgentPlan(data.plan) }
          : data.kind === "client"
            ? { kind: "client" as const }
            : null,
      );
    answer.catch(() => answers.delete(code));
    answers.set(code, answer);
  }
  return answer;
}

export function useRefOffer(refCode?: string | null): RefOffer | null {
  const [offer, setOffer] = useState<RefOffer | null>(null);

  useEffect(() => {
    // Код страницы (лендинг агента) главнее запомненного: человек прямо сейчас
    // пришёл по этой ссылке.
    const code = refCode || getAttributionForBooking().ref_code;
    let alive = true;

    // Ответ всегда приходит через промис, даже когда он уже известен: setState
    // прямо в теле эффекта запускает лишний каскад перерисовок (и на это ругается
    // react-hooks/set-state-in-effect).
    const answer = code ? lookup(code) : Promise.resolve(null);

    answer
      .then((result) => {
        if (alive) setOffer(result);
      })
      // Сеть отвалилась — молчим про скидку. Соврать «скидка есть» хуже, чем
      // не показать её: при оформлении она всё равно применится сама.
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, [refCode]);

  return offer;
}
