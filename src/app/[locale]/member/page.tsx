import type { Metadata } from "next";
import { getActiveServices } from "@/lib/services";
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

export default async function MemberPage() {
  // Список услуг — здесь, на сервере: сам кабинет рисуется в браузере и своих
  // данных до проверки подписи не получает, а услуги никакой тайны не несут
  // (тот же список отдаёт форма записи на сайте). Заодно не заводим ради них
  // отдельное серверное действие.
  const services = await getActiveServices();
  return <MemberApp services={services} />;
}
