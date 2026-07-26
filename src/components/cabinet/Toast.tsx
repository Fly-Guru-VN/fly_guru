"use client";

import { useEffect, useState } from "react";

// Всплывающее уведомление на пару секунд («Фото загружено»).
//
// Зачем отдельным модулем, а не состоянием внутри формы: формы загрузки фото на
// экране смены перемонтируются сразу после успеха (их key завязан на число
// снимков), и надпись внутри формы исчезала бы раньше, чем инструктор её
// заметит. Поэтому сообщение живёт в ToastHost — он подвешен в макете кабинета
// и переживает любые перерисовки контента.
//
// Вызов: showToast("Фото загружено") из любого клиентского кода.

interface Toast {
  id: number;
  text: string;
}

type Listener = (toast: Toast) => void;

const listeners = new Set<Listener>();
let nextId = 1;

export function showToast(text: string) {
  const toast = { id: nextId++, text };
  for (const listener of listeners) listener(toast);
}

const VISIBLE_MS = 2600;

export function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const listener: Listener = (toast) => {
      setToasts((prev) => [...prev, toast]);
      setTimeout(
        () => setToasts((prev) => prev.filter((t) => t.id !== toast.id)),
        VISIBLE_MS,
      );
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    // На телефоне поднимаем над нижней панелью меню (она ~5rem), на ПК — обычный
    // нижний край. pointer-events-none: уведомление не должно перехватывать
    // нажатие по кнопке под ним.
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="animate-toast-in flex max-w-full items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg"
        >
          <span aria-hidden>✓</span>
          <span className="truncate">{t.text}</span>
        </div>
      ))}
    </div>
  );
}
