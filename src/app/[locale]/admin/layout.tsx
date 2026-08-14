import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { vnCurrentMonth } from "@/lib/dates";
import { vnd } from "@/lib/stats";
import { getFinance } from "@/lib/finance";
import { BookingsBadgeRefresh } from "@/components/BookingsBadgeRefresh";
import { ToastHost } from "@/components/cabinet/Toast";
import { Sidebar } from "./Sidebar";

export const metadata: Metadata = { title: "Админка" };

// Кабинет админа: слева боковое меню (на ПК — колонка, на телефоне —
// разворачиваемая плашка), справа — контент активного раздела.
// Доступ: middleware (быстрый рубеж) → requireRole (роль из БД) → RLS.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole("admin", "/admin");

  // Данные для карточки профиля в сайдбаре: деньги школы на руках за месяц и
  // число новых заявок (красный счётчик). Эту цифру (а не выручку) босс хочет
  // видеть под рукой на всех разделах — тот же расчёт, что во вкладке «Расходы»
  // (пришло − 35% Marina − выданные зарплаты − выданное агентам − траты).
  const supabase = await createClient();
  const month = vnCurrentMonth();
  const [fin, freshRes] = await Promise.all([
    getFinance(supabase, month),
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("status", "new"),
  ]);

  const freshCount = freshRes.count ?? 0;

  return (
    // На ПК — app-shell: область кабинета фиксированной высоты (вьюпорт минус
    // шапка ~4rem), сайдбар и контент скроллятся независимо (крутится та
    // колонка, над которой мышь; левый бар не уезжает). На телефоне — обычный
    // скролл страницы, меню в фиксированной нижней панели (pb-24 под неё).
    // Ширина 7xl вместо 6xl (10.08.2026): в админке половина экранов — таблицы
    // (Статистика, Источники, Расчёт выплат), и на мониторе они жались в
    // колонку с горизонтальной прокруткой, пока справа пустовало поле.
    <div className="mx-auto w-full max-w-7xl px-4 pb-24 pt-6 md:h-[calc(100dvh-4rem)] md:py-0">
      {/* Живой красный бейдж заявок на всех разделах админки */}
      <BookingsBadgeRefresh channel="admin-bookings-badge" />
      {/* Всплывающие уведомления («Фото загружено») — см. кабинет инструктора. */}
      <ToastHost />
      <div className="md:flex md:h-full md:gap-6">
        <Sidebar
          name={user.name}
          photoUrl={user.photo_url}
          amountLabel={vnd(fin.cashLeft)}
          amountSub={`денег на руках · ${month.label}`}
          freshCount={freshCount}
        />
        <main className="scroll-soft mt-4 min-w-0 md:mt-0 md:flex-1 md:overflow-y-auto md:overscroll-contain md:py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
