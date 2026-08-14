import type { Metadata } from "next";
import { isAdminLike, requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminViewBanner } from "@/components/cabinet/AdminViewBanner";
import { BookingsBadgeRefresh } from "@/components/BookingsBadgeRefresh";
import { ToastHost } from "@/components/cabinet/Toast";
import { Sidebar } from "./Sidebar";

export const metadata: Metadata = { title: "Кабинет СММ" };

// Кабинет СММщика: слева меню, справа раздел — та же оболочка, что в админке.
// Разделы внутри — те же экраны админки, переиспользованные с базовым путём
// /smm (см. src/lib/auth.ts, cabinetBase): второй копии логики в проекте нет.
//
// Доступ: middleware (быстрый рубеж) → requireRole (роль из БД) → RLS (0040).
export default async function SmmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole("smm", "/smm");

  // Красный счётчик новых заявок — как у админа. Считаем служебным ключом:
  // политики 0040 дают СММщику select на bookings, но сюда заходит и админ
  // (посмотреть кабинет) — пусть у обоих оно работает одинаково.
  const { count } = await createAdminClient()
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("status", "new");

  return (
    // Ширина как в админке (7xl): здесь те же таблицы «Статистики» и
    // «Источников», на 6xl они жались в колонку с горизонтальной прокруткой.
    <div className="mx-auto w-full max-w-7xl px-4 pb-24 pt-6 md:h-[calc(100dvh-4rem)] md:py-0">
      {/* Живой красный бейдж заявок на всех разделах кабинета */}
      <BookingsBadgeRefresh channel="smm-bookings-badge" />
      <ToastHost />
      <div className="md:flex md:h-full md:gap-6">
        <Sidebar name={user.name} photoUrl={user.photo_url} freshCount={count ?? 0} />
        <main className="scroll-soft mt-4 min-w-0 md:mt-0 md:flex-1 md:overflow-y-auto md:overscroll-contain md:py-6">
          {isAdminLike(user.role) && <AdminViewBanner cabinet="СММ" />}
          {children}
        </main>
      </div>
    </div>
  );
}
