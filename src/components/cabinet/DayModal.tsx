"use client";

import { useEffect, type ReactNode } from "react";
import { Link, useRouter } from "@/i18n/navigation";

// Карточка дня календаря — поверх сетки, а не простынёй под ней (пачка №5,
// п.9). Оболочка клиентская (Esc, блокировка скролла), а содержимое приходит
// готовым с сервера через children: внутри живут обычные server actions
// (назначить/убрать смену) и фото, которые грузятся только для открытого дня.
//
// День выбран через ?d= в адресе, поэтому «закрыть» — это переход на closeHref
// (тот же месяц без ?d). Ссылку можно открыть и переслать: она сразу покажет
// нужный день с раскрытой карточкой.

export function DayModal({
  title,
  closeHref,
  wide = false,
  children,
}: {
  title: string;
  closeHref: string;
  /** Шире на ПК — для карточки дня админа, где содержимое идёт в две колонки. */
  wide?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.push(closeHref);
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [router, closeHref]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="animate-fade-in fixed inset-0 z-[100] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4"
    >
      {/* Фон-подложка: клик по ней закрывает день. Ссылкой, а не onClick, —
          работает и без JS, и правильно ведёт себя с «назад» в браузере. */}
      <Link href={closeHref} aria-label="Закрыть" className="absolute inset-0" />

      {/* Телефон — лист снизу на 90% высоты; ПК — карточка по центру.
          Скроллится содержимое модалки, страница под ней стоит на месте.
          Движение под форму: на телефоне лист выезжает снизу, на ПК карточка
          коротко всплывает по центру (sm: перебивает мобильную анимацию). */}
      <div
        className={`animate-sheet-up sm:animate-pop-in relative flex max-h-[90vh] w-full flex-col rounded-t-3xl border border-line bg-surface shadow-xl sm:max-h-[85vh] sm:max-w-2xl sm:rounded-3xl ${
          wide ? "lg:max-w-5xl" : ""
        }`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line/70 px-4 py-3 sm:px-6 sm:py-4">
          {/* first-letter, а не capitalize: в «пятница, 24 июля» capitalize
              поднимал и «Июля» — было «Пятница, 24 Июля». */}
          <h2 className="text-lg font-bold first-letter:uppercase">{title}</h2>
          <Link
            href={closeHref}
            aria-label="Закрыть"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line text-muted transition-colors hover:border-primary hover:text-primary"
          >
            ✕
          </Link>
        </div>

        {/* Полоса прокрутки — как в модалке записи: тонкая фирменная и с
            отступом от рамки, чтобы не упиралась в скруглённый угол. */}
        <div className="scroll-soft scroll-dim mb-2 mr-2 min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2 pl-4 pr-2 pt-4 sm:mr-3 sm:pl-6 sm:pr-3">
          {children}
        </div>
      </div>
    </div>
  );
}
