"use client";

import { useLinkStatus } from "next/link";

// Кружок загрузки — один на весь проект, чтобы «идёт работа» везде выглядело
// одинаково. Цвет берёт от текста (border-current), поэтому одинаково уместен
// и на белой кнопке, и на бирюзовой, и внутри цветной вкладки.
//
// aria-hidden намеренно: рядом всегда стоит текст («Сохраняем…», «Загрузка…»),
// который читалка и произнесёт. Кружок — картинка, дублировать её незачем.

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent ${className || "h-4 w-4"}`}
    />
  );
}

// Кружок для ССЫЛКИ раздела: крутится, пока Next тянет следующую страницу.
//
// Работает только внутри <Link> — useLinkStatus читает состояние ближайшей
// ссылки. Зачем: после нажатия на вкладку до появления новой страницы могла
// пройти секунда, и всё это время экран выглядел мёртвым, так что люди жали
// второй и третий раз (на пляжном интернете — обычное дело).
export function LinkSpinner({ className = "" }: { className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <Spinner className={className || "h-3.5 w-3.5"} />;
}
