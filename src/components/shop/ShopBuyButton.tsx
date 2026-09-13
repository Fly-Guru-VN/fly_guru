"use client";

import { useCallback, useState, type ReactNode } from "react";
import { trackEvent } from "@/lib/analytics";
import type { ShopSelection } from "@/lib/shop";
import { buttonClasses, type ButtonVariant } from "../ui";
import { ShopInquiryModal } from "./ShopInquiryModal";

// Кнопка «Купить» / «Написать нам»: открывает окно связи по выбранному товару.
// Своё состояние у каждой кнопки, без общего провайдера, как у записи: окно
// нужно только в магазине, и тащить его в layout всего сайта незачем.
export function ShopBuyButton({
  selection,
  image,
  place,
  children,
  variant = "primary",
  size = "lg",
  className = "",
}: {
  selection: ShopSelection;
  image?: string;
  place: string;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: "md" | "lg";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          trackEvent("shop_inquiry_open", {
            product: selection.productId ?? "consult",
            place,
          });
          setOpen(true);
        }}
        className={buttonClasses({ variant, size, className })}
      >
        {children}
      </button>
      {open && (
        <ShopInquiryModal selection={selection} image={image} onClose={close} />
      )}
    </>
  );
}
