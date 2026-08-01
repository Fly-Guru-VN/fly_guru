import type { Metadata } from "next";
import { getAppUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { vnToday } from "@/lib/dates";
import { getShiftForDay } from "@/lib/shifts";
import { getActiveEquipment } from "@/lib/equipment";
import { getDayReport } from "@/lib/dayReport";
import { ShiftPanel } from "@/components/cabinet/ShiftPanel";
import { DayReportCard } from "@/components/cabinet/DayReportCard";

export const metadata: Metadata = { title: "Смена" };

// Экран «Смена» (пак C, правила переписаны 27.07.2026): утром одно фото на
// пляже — оно открывает смену, вечером одно фото у бара на выходе — оно её
// закрывает. Оборудование снимают только утром и только по надобности: кто
// осматривает доски, инструкторы решают между собой (старший или кому удобно).
//
// Разметка общая с механиком (components/cabinet/ShiftPanel) — отличается лишь
// регламентом 9:00/18:00, за него отвечает strict.
//
// После закрытия здесь же появляется отчёт за день для журнала Marina Beach
// (пачка №15, п.1). Именно после, а не сразу: цифры для журнала — награда за
// закрытую смену, чтобы закрываться было зачем (см. шапку lib/dayReport).

export default async function InstructorShiftPage() {
  const user = await getAppUser();
  if (!user) return null; // layout уже средиректил бы; страховка для типов

  const supabase = await createClient();
  const today = vnToday();
  const [shift, equipment] = await Promise.all([
    getShiftForDay(supabase, user.id, today),
    getActiveEquipment(supabase),
  ]);

  // Отчёт считаем только на закрытой смене — и заодно не тратим запросы, пока
  // день идёт. service-role: сводка по всей школе, а инструктору RLS отдаёт
  // только его сессии и его смены.
  const report = shift?.closedAt
    ? await getDayReport(createAdminClient(), today, user.id)
    : null;

  return (
    <div>
      <h1 className="text-2xl font-bold">Смена</h1>
      <p className="mt-1 text-sm text-muted">
        Утром сделайте одно фото на пляже — смена откроется сама. Вечером, когда
        уходите, — одно фото у бара. Доску и крыло снимайте по надобности.
      </p>

      <div className="mt-6">
        <ShiftPanel
          shift={shift}
          boards={equipment.filter((e) => e.kind === "board")}
          wings={equipment.filter((e) => e.kind === "wing")}
        />
      </div>

      {report ? (
        <div className="mt-4">
          <DayReportCard report={report} />
        </div>
      ) : (
        // Обещание отчёта видно с самого утра — иначе про него узнают только те,
        // кто и так закрывается вовремя, а смысл затеи ровно в остальных.
        <p className="mt-4 rounded-2xl border border-dashed border-line px-4 py-3 text-xs text-muted">
          Закройте смену — здесь появится отчёт за день для журнала Марины:
          услуги по видам, выручка, комиссия площадке и ЗП.
        </p>
      )}
    </div>
  );
}
