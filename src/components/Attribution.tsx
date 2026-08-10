"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { captureAttribution, splitMarksForHit } from "@/lib/attribution";

// Невидимый компонент-«ловушка меток». Ничего не рисует.
// Задача: при каждом заходе на страницу (и при каждом переходе между страницами
// внутри сайта) заглянуть в адрес и, если там есть метки источника, запомнить их.
// Вставляется один раз в общий layout — работает на всех страницах сразу.
//
// Заодно отмечает сам переход в статистике (0037): по меченой ссылке пришёл
// человек — значит клик по рекламе состоялся, и это надо посчитать, даже если
// до заявки дело не дойдёт.
//
// Два правила, чтобы счётчик не врал:
//  1. Стучим только когда метка есть В АДРЕСЕ. Сохранённая метка живёт 30 дней,
//     и считать её на каждой странице значило бы записывать один клик десятки
//     раз.
//  2. Один и тот же адрес в одной вкладке считаем один раз — от перезагрузки
//     страницы (sessionStorage живёт до закрытия вкладки).
export function Attribution() {
  const pathname = usePathname();

  useEffect(() => {
    const marks = captureAttribution();
    if (Object.keys(marks).length === 0) return;

    const { src, utm } = splitMarksForHit(marks);
    if (!src && Object.keys(utm).length === 0) return; // только ref — считает лендинг /r

    const key = `flyguru_hit:${pathname}:${src ?? ""}:${JSON.stringify(utm)}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      // приватный режим — просто посчитаем ещё раз, это не повод падать
    }

    fetch("/api/ref-visits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ src, utm, path: pathname }),
      keepalive: true, // человек может сразу уйти дальше — запрос всё равно доедет
    }).catch(() => {});
    // pathname в зависимостях — чтобы срабатывало и при переходах без перезагрузки.
  }, [pathname]);

  return null;
}
