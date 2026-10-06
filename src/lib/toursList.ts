import type { createClient } from "@/lib/supabase/server";
import type { StatsRange } from "@/lib/stats";
import { failIfReadError } from "@/lib/dbError";
import { TOUR_CATEGORY } from "@/lib/tours";

// Список туров (экскурсии, сафари) за период — для вкладки «Экскурсии и
// сафари» в админке и у инструктора. Туры — это сессии с услугой категории
// tour (lib/tours); участники кроме контактного лица — в session_participants
// (0066). Доступ решает RLS: админ видит все, инструктор — только свои.

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface TourRow {
  id: string;
  date: string;
  amount: number;
  people: number;
  service_id: string | null;
  instructor_id: string | null;
  payment_method_id: string | null;
  paid_on: string | null;
  note: string | null;
  created_at: string;
  clients: { name: string; phone: string | null } | null;
  services: { name: string; code: string | null; category: string } | null;
  instructor: { name: string } | null;
  payment: { name: string } | null;
  participants: { id: string; name: string; phone: string | null }[];
}

const COLS =
  "id, date, amount, people, service_id, instructor_id, payment_method_id, paid_on, note, created_at, clients(name, phone), services!inner(name, code, category), instructor:users!instructor_id(name), payment:payment_methods(name)";

export async function loadTours(
  supabase: Supabase,
  range: StatsRange,
  instructorId?: string,
): Promise<TourRow[]> {
  let query = supabase
    .from("sessions")
    .select(COLS)
    .eq("services.category", TOUR_CATEGORY)
    .gte("date", range.fromDay)
    .lt("date", range.toDay)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  if (instructorId) query = query.eq("instructor_id", instructorId);
  const { data, error } = await query;
  failIfReadError(error, "не удалось прочитать экскурсии и сафари");
  const rows = (data ?? []) as unknown as Omit<TourRow, "participants">[];

  const ids = rows.map((r) => r.id);
  const bySession = new Map<string, TourRow["participants"]>();
  if (ids.length > 0) {
    const res = await supabase
      .from("session_participants")
      .select("session_id, client:clients(id, name, phone)")
      .in("session_id", ids);
    failIfReadError(res.error, "не удалось прочитать участников туров");
    for (const p of (res.data ?? []) as unknown as {
      session_id: string;
      client: { id: string; name: string; phone: string | null } | null;
    }[]) {
      if (!p.client) continue;
      const list = bySession.get(p.session_id) ?? [];
      list.push(p.client);
      bySession.set(p.session_id, list);
    }
  }
  return rows.map((r) => ({ ...r, participants: bySession.get(r.id) ?? [] }));
}
