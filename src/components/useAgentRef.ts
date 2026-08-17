"use client";

import { useEffect, useState } from "react";
import { getAttributionForBooking } from "@/lib/attribution";
import { asAgentPlan, type AgentPlan } from "@/lib/agentTerms";

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

// Ответы не перезапрашиваем на каждое открытие формы: код за сессию не меняется.
const answers = new Map<string, AgentPlan | null>();

export function useAgentRef(refCode?: string | null): AgentPlan | null {
  const [plan, setPlan] = useState<AgentPlan | null>(null);

  useEffect(() => {
    // Код страницы (лендинг агента) главнее запомненного: человек прямо сейчас
    // пришёл по этой ссылке.
    const code = refCode || getAttributionForBooking().ref_code;
    let alive = true;

    // Ответ всегда приходит через промис, даже когда он уже известен: setState
    // прямо в теле эффекта запускает лишний каскад перерисовок (и на это ругается
    // react-hooks/set-state-in-effect).
    const answer: Promise<AgentPlan | null> = !code
      ? Promise.resolve(null)
      : answers.has(code)
        ? Promise.resolve(answers.get(code)!)
        : fetch(`/api/ref/${encodeURIComponent(code)}`)
            .then((res) => (res.ok ? res.json() : { kind: null }))
            .then((data: { kind?: string | null; plan?: string | null }) => {
              const agentPlan = data.kind === "agent" ? asAgentPlan(data.plan) : null;
              answers.set(code, agentPlan);
              return agentPlan;
            });

    answer
      .then((agentPlan) => {
        if (alive) setPlan(agentPlan);
      })
      // Сеть отвалилась — молчим про скидку. Соврать «скидка есть» хуже, чем
      // не показать её: при оформлении она всё равно применится сама.
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, [refCode]);

  return plan;
}
