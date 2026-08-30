import type { Metadata } from "next";
import { MemberApp } from "./MemberApp";

// Кабинет клиента. Вход не по паролю, а через Telegram: страницу открывает
// мини-приложение бота, оно же передаёт подписанные данные о том, кто пришёл
// (см. lib/tgAuth). Поэтому здесь нет ни requireRole, ни редиректа на логин —
// личность проверяет серверное действие при каждом запросе данных.
//
// Открытая в обычном браузере, страница честно скажет, что живёт в Telegram,
// и предложит бота: без initData узнать человека невозможно.

export const metadata: Metadata = {
  title: "Кабинет FlyGuru",
  // В поиске ему делать нечего: без Telegram страница пустая (и /member уже
  // закрыт в robots.ts).
  robots: { index: false, follow: false },
};

export default function MemberPage() {
  return <MemberApp />;
}
