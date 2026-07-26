import type { Metadata } from "next";
import { getAppUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { vnToday } from "@/lib/dates";
import { getShiftForDay, isSeniorInstructor } from "@/lib/shifts";
import { getActiveEquipment } from "@/lib/equipment";
import { ShiftPanel } from "./ShiftPanel";

export const metadata: Metadata = { title: "Смена" };

// Экран «Смена» (пак C): инструктор утром открывает смену и снимает доску с
// крылом, вечером — закрывает и снимает снова. По парам снимков босс видит, что
// изменилось за день. Правила времени и статусы — в shiftRules.ts.
//
// С 0033 экран двоится: старший делает полный осмотр, второй на смене просто
// отмечается одним кадром «я на пляже». Времена открытия и закрытия пишутся
// одинаково, поэтому регламент 9:00/18:00 и 300 000 ₫ за выход у обоих общие.

export default async function InstructorShiftPage() {
  const user = await getAppUser();
  if (!user) return null; // layout уже средиректил бы; страховка для типов

  const supabase = await createClient();
  const [shift, equipment, senior] = await Promise.all([
    getShiftForDay(supabase, user.id, vnToday()),
    getActiveEquipment(supabase),
    // Админ заходит в кабинет инструктора как суперюзер — ему показываем
    // полный экран, иначе он не увидит, что вообще снимают на смене.
    user.role === "admin" ? true : isSeniorInstructor(supabase, user.id),
  ]);

  const boards = equipment.filter((e) => e.kind === "board");
  const wings = equipment.filter((e) => e.kind === "wing");

  return (
    <div>
      <h1 className="text-2xl font-bold">Смена</h1>
      <p className="mt-1 text-sm text-muted">
        {senior
          ? "Утром откройте смену и сфотографируйте доску и крыло, вечером — закройте. Снимайте прямо с камеры."
          : "Утром отметьтесь одним фото, что вы на пляже, вечером — что уходите. Снимайте прямо с камеры."}
      </p>

      {/* Без инвентаря нечего привязать к снимкам — но это забота старшего.
          Второму список не нужен, его экран пустой инвентарь не блокирует. */}
      {senior && boards.length === 0 && wings.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-line bg-surface p-4 text-sm text-muted">
          Инвентарь ещё не заведён — попросите админа добавить доски и крылья в
          Настройках. Без списка нечего привязать к фото.
        </p>
      ) : (
        <div className="mt-6">
          <ShiftPanel
            shift={shift}
            boards={boards}
            wings={wings}
            senior={senior}
          />
        </div>
      )}
    </div>
  );
}
