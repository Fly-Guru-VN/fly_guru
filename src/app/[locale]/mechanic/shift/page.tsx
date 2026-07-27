import type { Metadata } from "next";
import { getAppUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { vnToday } from "@/lib/dates";
import { getShiftForDay } from "@/lib/shifts";
import { getActiveEquipment } from "@/lib/equipment";
import { ShiftPanel } from "@/components/cabinet/ShiftPanel";

export const metadata: Metadata = { title: "Механик · Смена" };

// Экран «Смена» механика: та же фотофиксация, что у инструктора (общий
// ShiftPanel), но без регламента по времени — приходит и уходит когда нужно по
// работе, поэтому strict={false}: только время, без «вовремя/поздно».

export default async function MechanicShiftPage() {
  const user = await getAppUser();
  if (!user) return null; // layout уже средиректил бы; страховка для типов

  const supabase = await createClient();
  const [shift, equipment] = await Promise.all([
    getShiftForDay(supabase, user.id, vnToday()),
    getActiveEquipment(supabase),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold">Смена</h1>
      <p className="mt-1 text-sm text-muted">
        Пришли — одно фото на пляже, оно откроет смену. Уходите — фото у бара.
        Оборудование снимайте по надобности, время любое.
      </p>

      <div className="mt-6">
        <ShiftPanel
          shift={shift}
          boards={equipment.filter((e) => e.kind === "board")}
          wings={equipment.filter((e) => e.kind === "wing")}
          strict={false}
        />
      </div>
    </div>
  );
}
