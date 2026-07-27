import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { AdminViewBanner } from "@/components/cabinet/AdminViewBanner";
import { ToastHost } from "@/components/cabinet/Toast";
import { Sidebar } from "./Sidebar";

export const metadata: Metadata = { title: "Кабинет механика" };

// Кабинет механика: слева боковое меню, справа контент раздела — та же
// оболочка, что у инструктора. Запросов за ЗП и счётчиком записей здесь нет:
// зарплату механику не считают, а заявки он только заводит.
// Доступ уже проверил middleware (быстрый рубеж), здесь — второй рубеж
// с чтением роли из БД, третий — RLS в самой базе.
export default async function MechanicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole("mechanic", "/mechanic");

  return (
    // На ПК — app-shell: сайдбар и контент скроллятся независимо. На телефоне —
    // обычный скролл страницы, меню в фиксированной нижней панели (pb-24 под неё).
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 md:h-[calc(100dvh-4rem)] md:py-0">
      {/* Всплывающие уведомления («Фото загружено») — см. кабинет инструктора. */}
      <ToastHost />
      <div className="md:flex md:h-full md:gap-6">
        <Sidebar name={user.name} photoUrl={user.photo_url} />
        <main className="scroll-soft mt-4 min-w-0 md:mt-0 md:flex-1 md:overflow-y-auto md:overscroll-contain md:py-6">
          {user.role === "admin" && <AdminViewBanner cabinet="механика" />}
          {children}
        </main>
      </div>
    </div>
  );
}
