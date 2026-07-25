import type { createClient } from "@/lib/supabase/server";

// Справочник инвентаря (пачка правок №4, пак C): доски и крылья поштучно.
// Похож на dictionaries.ts (name + active), но с колонкой kind — фото смены
// привязывается к КОНКРЕТНОЙ единице, иначе по снимку не понять, что сломано.
// Ведёт админ в Настройках, читают оба (инструктору нужен список при съёмке).

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type EquipmentKind = "board" | "wing";

export interface EquipmentItem {
  id: string;
  kind: EquipmentKind;
  name: string;
  active: boolean;
}

export const EQUIPMENT_KINDS: EquipmentKind[] = ["board", "wing"];

// Человеческие подписи — рядом с типом, чтобы «доска/крыло» не разъехались
// по экранам.
export const KIND_LABEL: Record<EquipmentKind, string> = {
  board: "Доска",
  wing: "Крыло",
};

// Только активные — для выпадашек при съёмке смены.
export async function getActiveEquipment(
  supabase: Supabase,
): Promise<EquipmentItem[]> {
  const { data, error } = await supabase
    .from("equipment")
    .select("id, kind, name, active")
    .eq("active", true)
    .order("kind")
    .order("name");
  if (error) {
    console.error("[equipment] active load error:", error.message);
    return [];
  }
  return (data ?? []) as EquipmentItem[];
}

// Все единицы, включая скрытые — для экрана управления в настройках.
// Активные сверху: скрытые — архив внизу.
export async function getFullEquipment(
  supabase: Supabase,
): Promise<EquipmentItem[]> {
  const { data, error } = await supabase
    .from("equipment")
    .select("id, kind, name, active")
    .order("active", { ascending: false })
    .order("name");
  if (error) {
    console.error("[equipment] full load error:", error.message);
    return [];
  }
  return (data ?? []) as EquipmentItem[];
}
