"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Значок «?» рядом с непонятным словом (15.11.2026, просьба David: «мелких
// описаний на экране не надо, а кто хочет подробнее, жмёт вопросик»). По
// нажатию поверх страницы открывается маленькое окошко с крестиком.
//
// Нативный <dialog> с showModal(): фон затемняется, Esc и тап мимо окна его
// закрывают. Окно рисуется порталом в <body> и только когда открыто: значок
// можно ставить внутрь заголовка или абзаца, не ломая разметку (<dialog>
// внутри <p> браузер разбирает иначе, чем React) и не наследуя их шрифт.
// Не ставить внутрь <Link> и <summary>: нажатие ушло бы ещё и им.
//
// Цвет подложки задан литералом, а не bg-black/40: тот собирается через
// CSS-переменную, а ::backdrop переменные :root видит не во всех браузерах,
// и фон под окном оставался светлым (проверено скриншотом 15.11.2026).

export function Hint({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (open) ref.current?.showModal();
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label={`Что значит «${title}»`}
        onClick={() => setOpen(true)}
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line align-middle text-xs font-bold normal-case leading-none tracking-normal text-muted transition-colors hover:border-primary hover:text-primary"
      >
        ?
      </button>
      {open &&
        createPortal(
          <dialog
            ref={ref}
            onClose={() => setOpen(false)}
            // Тап по затемнению: цель клика — сам dialog, а не его содержимое.
            onClick={(e) => {
              if (e.target === ref.current) ref.current.close();
            }}
            className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-line bg-surface p-0 text-base text-ink shadow-xl backdrop:bg-[rgba(15,34,51,0.45)]"
          >
            <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="pt-1 font-bold">{title}</p>
                <button
                  type="button"
                  aria-label="Закрыть"
                  onClick={() => ref.current?.close()}
                  className="-mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg text-muted transition-colors hover:bg-line/50 hover:text-ink"
                >
                  ✕
                </button>
              </div>
              <div className="mt-1 space-y-2 text-sm text-muted">{children}</div>
            </div>
          </dialog>,
          document.body,
        )}
    </>
  );
}
