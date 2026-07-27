import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { vnCurrentMonth } from "@/lib/dates";
import { getInstructorStats, vnd } from "@/lib/stats";
import { BookingsBadgeRefresh } from "@/components/BookingsBadgeRefresh";
import { AdminViewBanner } from "@/components/cabinet/AdminViewBanner";
import { ToastHost } from "@/components/cabinet/Toast";
import { Sidebar } from "./Sidebar";

export const metadata: Metadata = { title: "Кабинет инструктора" };

// Кабинет инструктора: слева боковое меню (на ПК — колонка, на телефоне —
// разворачиваемая плашка), справа — контент активного раздела.
// Доступ уже проверил middleware (быстрый рубеж), здесь — второй рубеж
// с чтением роли из БД, третий — RLS в самой базе.
export default async function InstructorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole("instructor", "/instructor");

  // Данные для карточки профиля в сайдбаре: ЗП за месяц и число активных
  // записей (красный счётчик). Раньше считались на главном экране.
  const supabase = await createClient();
  const month = vnCurrentMonth();
  const [stats, { count }] = await Promise.all([
    getInstructorStats(
      supabase,
      user.id,
      month,
      user.role === "admin" ? "admin" : "instructor",
      // Доля 15% считается по чужим сессиям и сменам того же дня — их RLS
      // инструктору не отдаёт, поэтому расчёт идёт под service-role (наружу
      // уходит только итоговая сумма). Та же цифра, что на «Статистике».
      createAdminClient(),
    ),
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("status", "confirmed")
      .is("accepted_by", null),
  ]);
  const activeCount = count ?? 0;

  return (
    // На ПК — app-shell: область кабинета фиксированной высоты (вьюпорт минус
    // шапка ~4rem), сайдбар и контент скроллятся независимо (крутится та
    // колонка, над которой мышь; левый бар не уезжает). На телефоне — обычный
    // скролл страницы, меню в фиксированной нижней панели (pb-24 под неё).
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 md:h-[calc(100dvh-4rem)] md:py-0">
      {/* Живой красный бейдж записей на всех разделах кабинета */}
      <BookingsBadgeRefresh channel="instructor-bookings-badge" />
      {/* Всплывающие уведомления кабинета («Фото загружено»): держим в макете,
          чтобы они переживали перерисовку самих форм. */}
      <ToastHost />
      <div className="md:flex md:h-full md:gap-6">
        <Sidebar
          name={user.name}
          photoUrl={user.photo_url}
          amountLabel={vnd(stats.salary)}
          amountSub={`ЗП за ${month.label} · клиентов: ${stats.clientsCount}`}
          activeCount={activeCount}
        />
        <main className="scroll-soft mt-4 min-w-0 md:mt-0 md:flex-1 md:overflow-y-auto md:overscroll-contain md:py-6">
          {user.role === "admin" && <AdminViewBanner cabinet="инструктора" />}
          {children}
        </main>
      </div>
    </div>
  );
}
