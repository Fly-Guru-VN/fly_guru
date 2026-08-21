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
import { PageHeader } from "@/components/cabinet/PageHeader";

export const metadata: Metadata = { title: "СММ · Смена" };

// Экран «Смена» в кабинете СММщика (решение David от 21.08.2026): смену
// открывает любой сотрудник, и день, отработанный на пляже, считается ему как
// инструктору — 200 000 ₫ за выход, доля 15% с занятий дня и доля котла за этот
// день (см. lib/staff → SHIFT_CREW_ROLES). Раньше такие дни начальник добавлял
// и вычитал руками.
//
// Экран тот же, что у инструктора: общий ShiftPanel и тот же серверный экшен
// (requireFieldStaff пускает СММщика), поэтому второй копии правил нет.
// Регламент 9:00/18:00 действует (strict по умолчанию) — за выход платят
// ровно по нему, и снисхождения к роли тут быть не может.

export default async function SmmShiftPage() {
  const user = await getAppUser();
  if (!user) return null; // layout уже средиректил бы; страховка для типов

  const supabase = await createClient();
  const today = vnToday();
  const [shift, equipment] = await Promise.all([
    getShiftForDay(supabase, user.id, today),
    getActiveEquipment(supabase),
  ]);

  // Отчёт дня для журнала Марины — та же награда за закрытую смену, что у
  // инструктора. service-role: сводка по всей школе.
  const report = shift?.closedAt
    ? await getDayReport(createAdminClient(), today, user.id)
    : null;

  return (
    <div>
      <PageHeader
        title="Смена"
        hint="Утром фото на пляже — смена откроется сама. Вечером — фото у бара."
      />

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
        <p className="mt-4 rounded-2xl border border-dashed border-line px-4 py-3 text-xs text-muted">
          Закройте смену — здесь появится отчёт за день для журнала Марины:
          услуги по видам, выручка, комиссия площадке и ЗП.
        </p>
      )}
    </div>
  );
}
