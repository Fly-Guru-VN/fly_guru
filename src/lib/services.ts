import { createAdminClient } from "@/lib/supabase/admin";
import type { ServiceOption } from "@/components/BookingForm";
import { sortServicesByType } from "@/lib/serviceOrder";
import {
  services as contentServices,
  type Service,
  type ServiceCategory,
} from "@/content/services";

// «Достать список активных услуг из базы» для выпадающего списка в форме.
//
// Зачем из базы, а не из файла services.ts: в базе у каждой услуги свой
// настоящий id (uuid), и именно его форма должна отправить в заявку (там связь
// по id). Названия в файле те же, но id — только в базе.
//
// category (необязательно) — показать услуги только одной категории
// (например, на странице обучения — только training).
export async function getActiveServices(
  category?: ServiceCategory,
): Promise<ServiceOption[]> {
  const supabase = createAdminClient();
  let query = supabase
    .from("services")
    .select("id, name, category, code, price")
    .eq("active", true);

  if (category) query = query.eq("category", category);

  const { data, error } = await query;
  if (error) {
    console.error("[services] load error:", error.message);
    return [];
  }
  // Порядок — общий для всей системы (lib/serviceOrder.ts): похожие услуги
  // рядом, базовое обучение первым.
  return sortServicesByType(data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    code: (s.code as string | null) ?? null,
    // Цену форма показывает на карточке услуги. NULL бывает у услуг, которые
    // считаются «по договорённости», — такая карточка просто без цены.
    price: s.price === null || s.price === undefined ? null : Number(s.price),
  }));
}

// Услуги для публичных страниц: тексты и описания — из контента
// (content/services.ts), цены и длительность — из базы (правятся в админке).
// Связь по services.code (миграция 0010). Нет строки в базе или цена пуста —
// остаётся значение из файла: сайт не ломается даже на пустой базе.
export async function getSiteServices(): Promise<Service[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("services")
    .select("code, price, duration_min")
    .not("code", "is", null);
  if (error) {
    console.error("[services] site prices load error:", error.message);
    return contentServices;
  }
  const byCode = new Map((data ?? []).map((r) => [r.code as string, r]));
  return contentServices.map((s) => {
    const db = byCode.get(s.id);
    if (!db) return s;
    return {
      ...s,
      price: db.price != null ? Number(db.price) : s.price,
      durationMin: db.duration_min ?? s.durationMin,
    };
  });
}

// getService для списка из getSiteServices (в контенте есть все id сайта).
export function pickService(list: Service[], id: string): Service {
  const s = list.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown service id: ${id}`);
  return s;
}
