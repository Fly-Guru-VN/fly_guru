"use client";

import { useSyncExternalStore } from "react";

// Номер заявки из ?no=… — читаем в браузере, чтобы страница «спасибо»
// осталась статической (SSG): сервер номера не знает, а клиенту он нужен,
// чтобы назвать его при созвоне.
//
// useSyncExternalStore, а не useState + useEffect: адресная строка — это
// внешнее по отношению к React хранилище, и читать её эффектом, который тут же
// зовёт setState, значит рисовать страницу дважды (на это ругался и линтер).
// Здесь же сервер отдаёт null, клиент при первом рендере — сам номер.
const subscribe = () => () => {}; // строка запроса не меняется без перезагрузки

function readBookingNo(): string | null {
  const raw = new URLSearchParams(window.location.search).get("no");
  return raw && /^\d+$/.test(raw) ? raw : null;
}

export function BookingNo() {
  const no = useSyncExternalStore(subscribe, readBookingNo, () => null);

  if (!no) return null;

  return (
    <p className="mt-4 inline-block rounded-full bg-primary/10 px-5 py-2 font-semibold text-primary">
      Номер вашей заявки: #{no}
    </p>
  );
}
