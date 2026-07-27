"use client";

import { useEffect, useState } from "react";
import { BookBtn } from "./BookBtn";

// Липкая кнопка «Записаться» внизу экрана телефона.
//
// Появляется, когда первый экран уехал вверх (на самом первом экране кнопка уже
// есть — вторая только мешала бы кадру), и прячется у самого низа страницы,
// чтобы не накрывать контакты в подвале. На ПК её нет: там кнопка всегда видна
// в шапке.
export function StickyBookBar() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const bottom = y + window.innerHeight;
      const nearEnd = bottom > document.documentElement.scrollHeight - 220;
      setShow(y > window.innerHeight * 0.6 && !nearEnd);
    };
    onScroll();
    // passive: слушатель ничего не отменяет, браузер не ждёт его перед прокруткой.
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div
      // Панель всегда в разметке, но уезжает вниз за край — так появление
      // получается плавным, без подскока содержимого страницы.
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur transition-transform duration-300 md:hidden ${
        show ? "translate-y-0" : "translate-y-full"
      }`}
      // Скрытую панель убираем и от читалок, и от перехода по Tab.
      inert={!show}
    >
      <BookBtn size="lg" className="w-full">
        Записаться
      </BookBtn>
    </div>
  );
}
