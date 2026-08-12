"use client";

import { useCallback, useSyncExternalStore } from "react";
import { LATEST_UPDATE } from "@/content/updates";

// Красная точка «есть новое» на вкладке «Обновления» — общая механика для меню
// инструктора и меню админа.
//
// Дату последней прочитанной записи держим в самом браузере: заводить ради
// этого колонку в базе не за что, а телефон у человека свой. Ключ хранилища —
// параметр: у инструктора и админа он разный, иначе прочитанное в одном
// кабинете гасило бы точку в другом.

export const INSTRUCTOR_UPDATES_SEEN_KEY = "flyguru:updates-seen";
export const ADMIN_UPDATES_SEEN_KEY = "flyguru:updates-seen:admin";
export const SMM_UPDATES_SEEN_KEY = "flyguru:updates-seen:smm";

const UPDATES_SEEN_EVENT = "flyguru:updates-seen-changed";

// Собственное событие: `storage` браузер шлёт только ДРУГИМ вкладкам, а точку
// надо погасить в этой же.
function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(UPDATES_SEEN_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(UPDATES_SEEN_EVENT, onChange);
  };
}

// Приватный режим Safari умеет бросаться на localStorage — молча считаем, что
// человек ничего не читал, вместо белого экрана кабинета.
function read(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

export function useUpdatesSeen(storageKey: string) {
  // Прочитанность лежит во внешнем хранилище (localStorage), поэтому
  // useSyncExternalStore, а не эффект с setState (на такой эффект ругается
  // линтер, и страница рисовалась бы дважды — тот же разбор, что в BookingNo).
  // Сервер отдаёт null: до гидратации мы не знаем, читал человек ленту или нет,
  // и молча не зажигаем точку.
  const seen = useSyncExternalStore(
    subscribe,
    useCallback(() => read(storageKey), [storageKey]),
    () => null,
  );

  const markSeen = useCallback(() => {
    try {
      if (localStorage.getItem(storageKey) === LATEST_UPDATE) return;
      localStorage.setItem(storageKey, LATEST_UPDATE);
      window.dispatchEvent(new Event(UPDATES_SEEN_EVENT));
    } catch {
      // приватный режим — точка просто останется гореть
    }
  }, [storageKey]);

  return { hasNew: seen !== null && seen < LATEST_UPDATE, markSeen };
}
