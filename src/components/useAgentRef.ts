"use client";

import { useEffect, useState } from "react";
import { getAttributionForBooking } from "@/lib/attribution";

// «Гость пришёл по живой агентской ссылке?» — один ответ на весь сайт.
//
// Код лежит в браузере до 30 дней (lib/attribution), поэтому спросить его можно
// с любой страницы, а не только с лендинга /r/<код>. Но сам по себе код ничего
// не значит: скидку даёт только ссылка активного агента, инструкторская — нет.
// Проверяет это сервер (api/ref/[code]), здесь мы только спрашиваем и держим
// ответ.
//
// Пока ответа нет — false. То есть по умолчанию сайт молчит про скидку и не
// обещает того, чего может не быть; плашка появляется, когда сервер подтвердил.

// Ответы не перезапрашиваем на каждое открытие формы: код за сессию не меняется.
const answers = new Map<string, boolean>();

export function useAgentRef(refCode?: string | null): boolean {
  const [isAgent, setIsAgent] = useState(false);

  useEffect(() => {
    // Код страницы (лендинг агента) главнее запомненного: человек прямо сейчас
    // пришёл по этой ссылке.
    const code = refCode || getAttributionForBooking().ref_code;
    let alive = true;

    // Ответ всегда приходит через промис, даже когда он уже известен: setState
    // прямо в теле эффекта запускает лишний каскад перерисовок (и на это ругается
    // react-hooks/set-state-in-effect).
    const answer: Promise<boolean> = !code
      ? Promise.resolve(false)
      : answers.has(code)
        ? Promise.resolve(answers.get(code)!)
        : fetch(`/api/ref/${encodeURIComponent(code)}`)
            .then((res) => (res.ok ? res.json() : { kind: null }))
            .then((data: { kind?: string | null }) => {
              const agent = data.kind === "agent";
              answers.set(code, agent);
              return agent;
            });

    answer
      .then((agent) => {
        if (alive) setIsAgent(agent);
      })
      // Сеть отвалилась — молчим про скидку. Соврать «скидка есть» хуже, чем
      // не показать её: при оформлении она всё равно применится сама.
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, [refCode]);

  return isAgent;
}
