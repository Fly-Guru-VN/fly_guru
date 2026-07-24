import type { createClient } from "@/lib/supabase/server";
import { vnMonth } from "@/lib/dates";

// Данные календаря за месяц — общий источник для админского и инструкторского
// кабинетов (цифры не должны расходиться). Собираем карту «день → смены +
// записи клиентов». Смена = выход инструктора (таблица shifts, пак H1);
// записи = подтверждённые заявки на этот день (bookings.preferred_date).

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface ShiftEntry {
  id: string;
  instructorId: string;
  name: string;
  note: string | null;
  // Факт выхода (пак C). null — смена запланирована, но инструктор её ещё не
  // открыл/закрыл.
  planned: boolean;
  openedAt: string | null;
  closedAt: string | null;
  openComment: string | null;
  closeComment: string | null;
  // Премия за выход снята админом вручную и почему (пачка №9, пак 2).
  bonusCancelled: boolean;
  bonusComment: string | null;
}

export type PhotoPhase = "open" | "close";
export type PhotoKind = "board" | "wing" | "comms" | "extra";

export interface ShiftPhoto {
  id: string;
  phase: PhotoPhase;
  kind: PhotoKind;
  equipmentId: string | null;
  equipmentName: string | null;
  path: string;
  url: string;
}

// Смена инструктора на конкретный день с фактом и фотографиями — источник для
// экрана «Смена» в кабинете.
export interface InstructorShift {
  id: string;
  date: string;
  planned: boolean;
  openedAt: string | null;
  closedAt: string | null;
  openComment: string | null;
  closeComment: string | null;
  photos: ShiftPhoto[];
}

export interface DayBooking {
  id: string;
  clientName: string;
  time: string | null;
  serviceName: string | null;
  acceptedName: string | null;
}

export interface CalendarDay {
  shifts: ShiftEntry[];
  bookings: DayBooking[];
}

export interface StaffMember {
  id: string;
  name: string;
  // Смену можно поставить и админу, но премия за выход — только наёмным
  // инструкторам (пачка №9, пак 2), поэтому роль нужна экрану календаря.
  role: string;
}

export interface MonthCalendar {
  // 'YYYY-MM-DD' → что в этот день; дни без событий в карте отсутствуют.
  days: Map<string, CalendarDay>;
  // Инструкторы + админ (кому можно ставить смену) — для панели дня у админа.
  staff: StaffMember[];
}

// Смены месяца. Колонки премии добавила миграция 0027, а деплой у David едет
// раньше наката — без этой страховки календарь падал бы целиком из-за двух
// колонок, которых ещё нет (тот же приём, что в lib/salary и у 0025).
interface MonthShiftRow {
  id: string;
  instructor_id: string;
  date: string;
  note: string | null;
  planned: boolean | null;
  opened_at: string | null;
  closed_at: string | null;
  open_comment: string | null;
  close_comment: string | null;
  bonus_cancelled?: boolean | null;
  bonus_comment?: string | null;
  instructor: { name: string } | null;
}

async function loadMonthShifts(
  supabase: Supabase,
  fromDay: string,
  toDay: string,
): Promise<{ data: MonthShiftRow[] }> {
  const base =
    "id, instructor_id, date, note, planned, opened_at, closed_at, open_comment, close_comment, instructor:users!instructor_id(name)";
  const withBonus = `${base}, bonus_cancelled, bonus_comment`;

  const query = (columns: string) =>
    supabase
      .from("shifts")
      .select(columns)
      .gte("date", fromDay)
      .lt("date", toDay);

  const res = await query(withBonus);
  if (!res.error) return { data: (res.data ?? []) as unknown as MonthShiftRow[] };

  const plain = await query(base);
  if (plain.error) {
    console.error("[shifts] month load error:", plain.error.message);
    return { data: [] };
  }
  return { data: (plain.data ?? []) as unknown as MonthShiftRow[] };
}

export async function getMonthCalendar(
  supabase: Supabase,
  ym: string,
): Promise<MonthCalendar> {
  const { fromDay, toDay } = vnMonth(ym);

  const [shiftsRes, bookingsRes, staffRes] = await Promise.all([
    loadMonthShifts(supabase, fromDay, toDay),
    supabase
      .from("bookings")
      .select(
        "id, client_name, preferred_date, scheduled_time, services(name), accepted:users!accepted_by(name)",
      )
      .eq("status", "confirmed")
      .gte("preferred_date", fromDay)
      .lt("preferred_date", toDay),
    supabase
      .from("users")
      .select("id, name, role")
      .in("role", ["instructor", "admin"])
      .order("name"),
  ]);

  const days = new Map<string, CalendarDay>();
  const day = (d: string): CalendarDay => {
    let entry = days.get(d);
    if (!entry) {
      entry = { shifts: [], bookings: [] };
      days.set(d, entry);
    }
    return entry;
  };

  for (const s of shiftsRes.data ?? []) {
    const instr = s.instructor as unknown as { name: string } | null;
    day(s.date as string).shifts.push({
      id: s.id as string,
      instructorId: s.instructor_id as string,
      name: instr?.name ?? "?",
      note: (s.note as string | null) ?? null,
      planned: (s.planned as boolean | null) ?? true,
      openedAt: (s.opened_at as string | null) ?? null,
      closedAt: (s.closed_at as string | null) ?? null,
      openComment: (s.open_comment as string | null) ?? null,
      closeComment: (s.close_comment as string | null) ?? null,
      bonusCancelled: Boolean(s.bonus_cancelled),
      bonusComment: (s.bonus_comment as string | null) ?? null,
    });
  }

  for (const b of bookingsRes.data ?? []) {
    const svc = b.services as unknown as { name: string } | null;
    const acc = b.accepted as unknown as { name: string } | null;
    day(b.preferred_date as string).bookings.push({
      id: b.id as string,
      clientName: (b.client_name as string) ?? "Клиент",
      time: (b.scheduled_time as string | null) ?? null,
      serviceName: svc?.name ?? null,
      acceptedName: acc?.name ?? null,
    });
  }

  // Записи внутри дня — по времени (у кого нет времени, в конец).
  for (const d of days.values()) {
    d.bookings.sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99"));
  }

  return { days, staff: (staffRes.data ?? []) as StaffMember[] };
}

// Фотографии смен по списку id — одним запросом (панель дня у админа
// показывает несколько смен сразу). Отдаём картой shiftId → фото.
export async function loadShiftPhotos(
  supabase: Supabase,
  shiftIds: string[],
): Promise<Map<string, ShiftPhoto[]>> {
  const map = new Map<string, ShiftPhoto[]>();
  if (shiftIds.length === 0) return map;

  const { data, error } = await supabase
    .from("shift_photos")
    .select("id, shift_id, phase, kind, equipment_id, path, url, equipment(name)")
    .in("shift_id", shiftIds)
    .order("created_at");
  if (error) {
    console.error("[shifts] photos load error:", error.message);
    return map;
  }

  for (const p of data ?? []) {
    const equip = p.equipment as unknown as { name: string } | null;
    const photo: ShiftPhoto = {
      id: p.id as string,
      phase: p.phase as PhotoPhase,
      kind: p.kind as PhotoKind,
      equipmentId: (p.equipment_id as string | null) ?? null,
      equipmentName: equip?.name ?? null,
      path: p.path as string,
      url: p.url as string,
    };
    const sid = p.shift_id as string;
    const list = map.get(sid);
    if (list) list.push(photo);
    else map.set(sid, [photo]);
  }
  return map;
}

// Смена инструктора на сегодня (или любой день) с фактом и фото — для экрана
// «Смена». null, если инструктор ещё не открывал смену в этот день и админ её
// не планировал (строки shifts просто нет).
export async function getShiftForDay(
  supabase: Supabase,
  instructorId: string,
  date: string,
): Promise<InstructorShift | null> {
  const { data: shift, error } = await supabase
    .from("shifts")
    .select(
      "id, date, planned, opened_at, closed_at, open_comment, close_comment",
    )
    .eq("instructor_id", instructorId)
    .eq("date", date)
    .maybeSingle();
  if (error) {
    console.error("[shifts] day shift load error:", error.message);
    return null;
  }
  if (!shift) return null;

  const photos = await loadShiftPhotos(supabase, [shift.id as string]);
  return {
    id: shift.id as string,
    date: shift.date as string,
    planned: (shift.planned as boolean | null) ?? true,
    openedAt: (shift.opened_at as string | null) ?? null,
    closedAt: (shift.closed_at as string | null) ?? null,
    openComment: (shift.open_comment as string | null) ?? null,
    closeComment: (shift.close_comment as string | null) ?? null,
    photos: photos.get(shift.id as string) ?? [],
  };
}
