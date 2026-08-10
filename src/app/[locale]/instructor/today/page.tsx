import type { Metadata } from "next";
import { getAppUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { vnToday } from "@/lib/dates";
import { getDayReport } from "@/lib/dayReport";
import { TodayBoard, type TodayBooking } from "@/components/cabinet/TodayBoard";
import { PageHeader } from "@/components/cabinet/PageHeader";

export const metadata: Metadata = { title: "Сегодня" };

// Живая сводка текущего дня: ЗП, выручка, 35% Марине, касса по способам оплаты
// (просьба инструктора, 10.08.2026 — см. шапку components/cabinet/TodayBoard).
//
// Кэш выключен намеренно: экран открывают несколько раз за день, и каждый раз
// он должен показывать состояние на эту минуту, а не то, что было утром.
export const dynamic = "force-dynamic";

export default async function InstructorTodayPage() {
  const user = await getAppUser();
  if (!user) return null; // layout уже средиректил бы; страховка для типов

  const today = vnToday();
  const supabase = await createClient();

  // Отчёт — под service-role: сводка по всей школе, а инструктору RLS отдаёт
  // только его сессии и его смены (та же причина, что в отчёте для журнала).
  // Заявки читаем обычным клиентом — их инструктор видит и так.
  const [report, bookingsRes] = await Promise.all([
    getDayReport(createAdminClient(), today, user.id),
    supabase
      .from("bookings")
      .select("id, client_name, scheduled_time, services(name), accepted:users!accepted_by(name)")
      .eq("status", "confirmed")
      .eq("preferred_date", today)
      .order("scheduled_time", { ascending: true, nullsFirst: false })
      .limit(30),
  ]);

  type BookingRow = {
    id: string;
    client_name: string;
    scheduled_time: string | null;
    services: { name: string } | null;
    accepted: { name: string } | null;
  };
  const bookings: TodayBooking[] = (
    (bookingsRes.data ?? []) as unknown as BookingRow[]
  ).map((b) => ({
    id: b.id,
    name: b.client_name,
    time: b.scheduled_time,
    service: b.services?.name ?? null,
    acceptedBy: b.accepted?.name ?? null,
  }));

  const dateLabel = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(`${today}T00:00:00Z`));

  return (
    <div>
      <PageHeader
        title="Сегодня"
        hint={`${dateLabel} · цифры обновляются по мере записей`}
      />

      <TodayBoard report={report} bookings={bookings} />
    </div>
  );
}
