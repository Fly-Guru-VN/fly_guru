"use client";

import type { ReactNode } from "react";
import { buttonClasses, type ButtonVariant } from "./ui";
import { useBooking } from "./BookingProvider";

// Кнопка «Записаться», открывающая единую модалку записи (пак 5). Выглядит как
// <Button>, но не ведёт на страницу-якорь, а открывает форму поверх текущей.
// serviceId — какую услугу выбрать заранее; refCode — реф-код на лендинге;
// place — метка для аналитики: с какой именно кнопки открыли форму.

export function BookBtn({
  serviceId,
  refCode,
  place,
  children,
  variant = "primary",
  size = "md",
  className = "",
}: {
  serviceId?: string;
  refCode?: string;
  place?: string;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: "md" | "lg";
  className?: string;
}) {
  const { open } = useBooking();
  return (
    <button
      type="button"
      onClick={() => open({ serviceId, refCode, place })}
      className={buttonClasses({ variant, size, className })}
    >
      {children}
    </button>
  );
}
