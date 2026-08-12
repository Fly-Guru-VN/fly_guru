"use client";

import type { ReactNode } from "react";

// Submit с браузерным confirm() — для действий, которые трогают уже
// посчитанные деньги (снятие отметки оплаты, удаление сессий и абонементов).
export function ConfirmSubmit({
  message,
  className,
  formAction,
  children,
}: {
  message: string;
  className?: string;
  // Своя цель отправки — когда кнопка живёт в форме с другим действием (в
  // карточке заявки одна форма, а кнопок статуса в ней несколько).
  formAction?: (formData: FormData) => void | Promise<void>;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      className={className}
      formAction={formAction}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
