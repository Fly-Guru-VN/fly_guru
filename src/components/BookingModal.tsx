"use client";

import { useEffect, useRef } from "react";
import { BookingForm, type ServiceOption } from "./BookingForm";

// Модалка записи: затемнённый + размытый фон (внимание на форме), панель по
// центру с той же самой BookingForm. Закрытие — крестик, клик по фону, Esc.
// Пока открыта, скролл страницы под ней заблокирован.

export function BookingModal({
  services,
  defaultServiceId,
  refCode,
  onClose,
}: {
  services: ServiceOption[];
  defaultServiceId?: string;
  refCode?: string;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Гасим скролл фона, чтобы страница под модалкой не «уезжала».
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    // Фокус на имя (не на honeypot и не на крестик) — сразу можно печатать.
    panelRef.current?.querySelector<HTMLElement>("#clientName")?.focus();

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Запись"
      onClick={onClose}
      className="animate-fade-in fixed inset-0 z-[100] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4"
    >
      {/* Высота ограничена экраном, а прокручивается ТОЛЬКО содержимое: форма
          длиннее невысокого ноутбучного окна, и панель, растущая по содержимому,
          вылезала за края — заголовок с крестиком уезжали вверх, кнопка
          «Записаться» вниз. Устройство то же, что у карточки дня календаря. */}
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-up sm:animate-pop-in relative flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl border border-line bg-surface shadow-xl sm:max-h-[88dvh] sm:rounded-3xl"
      >
        <div className="flex items-center justify-between gap-3 px-6 pb-2 pt-6 sm:px-8 sm:pt-8">
          <h2 className="text-2xl font-bold">Запись</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line text-muted transition-colors hover:border-primary hover:text-primary"
          >
            ✕
          </button>
        </div>

        {/* Без подзаголовка: первым делом гость должен видеть поле «Имя», а не
            ещё одну строку текста (пачка №5, п.2).

            Полоса прокрутки: фирменная тонкая (scroll-soft + scroll-dim) и
            отодвинута от края панели — правый отступ поменьше, а разницу
            добираем внешним полем (mr/mb). Раньше системная серая полоса со
            стрелками стояла вплотную к рамке и заезжала на скруглённый угол. */}
        <div className="scroll-soft scroll-dim mb-2 mr-2 min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4 pl-6 pr-4 pt-2 sm:mb-3 sm:mr-3 sm:pb-5 sm:pl-8 sm:pr-5">
          <BookingForm
            services={services}
            defaultServiceId={defaultServiceId}
            refCode={refCode}
            onSuccess={onClose}
          />
        </div>
      </div>
    </div>
  );
}
