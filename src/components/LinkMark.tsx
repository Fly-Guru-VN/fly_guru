"use client";

import { useEffect } from "react";
import { captureSrc } from "@/lib/attribution";

// Невидимый помощник коротких рекламных ссылок /i/<метка> и /b/<метка>.
// Ничего не рисует. Делает то же, что <Attribution> делает для ?src=…, только
// метка берётся из пути:
//  1) запоминает источник в браузере гостя на 30 дней;
//  2) отмечает переход в статистике (0037) — один раз на вкладку;
//  3) если попросили — стирает служебный адрес из адресной строки.
//
// Зачем третий пункт: ссылку в шапке Instagram гость видит и запоминает, и
// «flyguru.vn/i/instagram» в адресной строке выглядит технической. Меняем адрес
// БЕЗ перехода (history.replaceState) — страница уже отрисована, ничего не
// перезагружается и не мигает, меняется только строка адреса. App Router с
// Next 15 такие вызовы отслеживает сам, назад/вперёд не ломаются.
export function LinkMark({ src, cleanTo }: { src: string; cleanTo?: string }) {
  useEffect(() => {
    if (!src) return;

    captureSrc(src);

    // Тот же ключ, что у <Attribution>: перезагрузка страницы не должна
    // считаться вторым переходом.
    const path = `${cleanTo ? "/i" : "/b"}/${src}`;
    const key = `flyguru_hit:${path}:${src}:{}`;
    let counted = false;
    try {
      counted = Boolean(window.sessionStorage.getItem(key));
      if (!counted) window.sessionStorage.setItem(key, "1");
    } catch {
      // приватный режим — посчитаем ещё раз, это не повод падать
    }

    if (!counted) {
      fetch("/api/ref-visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ src, path }),
        keepalive: true, // гость может сразу уйти дальше — запрос всё равно доедет
      }).catch(() => {});
    }

    if (cleanTo) window.history.replaceState(null, "", cleanTo);
  }, [src, cleanTo]);

  return null;
}
