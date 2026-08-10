"use client";

import { useEffect } from "react";
import { captureRefCode } from "@/lib/attribution";

// Невидимый помощник для реф-лендинга /r/[code]. Ничего не рисует.
// При открытии страницы делает две вещи:
//  1) запоминает реф-код в браузере гостя на 30 дней (чтобы реферал засчитался,
//     даже если гость уйдёт и вернётся позже через главную и оставит заявку там);
//  2) тихо сообщает серверу «был заход по этому коду» — для статистики переходов.
export function RefVisitLogger({ code }: { code: string }) {
  useEffect(() => {
    if (!code) return;

    // 1. Сохранить код в память браузера (last-touch, окно 30 дней).
    captureRefCode(code);

    // 2. Отметить переход в статистике. Ошибку глушим — это некритичный лог.
    fetch("/api/ref-visits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, path: `/r/${code}` }),
      keepalive: true,
    }).catch(() => {});
  }, [code]);

  return null;
}
