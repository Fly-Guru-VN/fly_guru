import type { Metadata } from "next";
import { getAppUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { vnToday } from "@/lib/dates";
import { getShiftForDay } from "@/lib/shifts";
import { getActiveEquipment } from "@/lib/equipment";
import { ShiftPanel } from "@/components/cabinet/ShiftPanel";

export const metadata: Metadata = { title: "Смена" };

// Экран «Смена» (пак C, правила переписаны 27.07.2026): утром одно фото на
// пляже — оно открывает смену, вечером одно фото у бара на выходе — оно её
// закрывает. Оборудование снимают только утром и только по надобности: кто
// осматривает доски, инструкторы решают между собой (старший или кому удобно).
//
// Разметка общая с механиком (components/cabinet/ShiftPanel) — отличается лишь
// регламентом 9:00/18:00, за него отвечает strict.

export default async function InstructorShiftPage() {
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
    </div>
  );
}
