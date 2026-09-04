import type { createClient } from "@/lib/supabase/server";
import { vnMonth } from "@/lib/dates";
import { hiddenStaffIds } from "@/lib/staff";
import { failIfReadError } from "@/lib/dbError";
import { createPrivatePhotoUrls } from "@/lib/privateStorage";

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
// 'checkin' — одиночный кадр «я на пляже» от второго инструктора на смене
// (0033): он не осматривает оборудование, а подтверждает, что пришёл.
export type PhotoKind = "board" | "wing" | "comms" | "extra" | "checkin";

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
  // Смену можно поставить и админу, но премия за выход — только полевому
  // составу (инструктор и СММщик, см. staff → SHIFT_CREW_ROLES), поэтому роль
  // нужна экрану календаря. Ею же календарь отличает механика: регламент
  // 9:00/18:00 не про него, у его смены показываем голое время без
  // «вовремя/поздно».
  role: string;
}

export interface MonthCalendar {
  // 'YYYY-MM-DD' → что в этот день; дни без событий в карте отсутствуют.
  days: Map<string, CalendarDay>;
  // Инструкторы + админ (кому можно ставить смену) — для панели дня у админа.
  staff: StaffMember[];
}

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
  const { data, error } = await supabase
    .from("shifts")
    .select(
      "id, instructor_id, date, note, planned, opened_at, closed_at, open_comment, close_comment, bonus_cancelled, bonus_comment, instructor:users!instructor_id(name)",
    )
    .gte("date", fromDay)
    .lt("date", toDay);

  // Колонки премии (0027) в боевой базе есть. Повтор запроса без них убран
  // 16.08.2026: он ловил любую ошибку и оставлял календарь пустым — месяц без
  // единой смены выглядит как факт, а не как сбой.
  failIfReadError(error, "не удалось прочитать смены месяца");
  return { data: (data ?? []) as unknown as MonthShiftRow[] };
}

// Кому можно ставить смену и чьи выходы показывать в карточке дня.
//
// Механик здесь ради админа: смену тот открывает себе сам, но босс должен
// видеть, во сколько человек пришёл, ушёл и что снял. С 21.08.2026 по той же
// причине здесь и СММщик: смену открывает любой сотрудник, и в календаре
// босс должен видеть весь состав дня, а не только инструкторов.
//
// Роль 'mechanic' приехала в 0028 и в боевой базе есть. Повтор запроса без неё
// убран 16.08.2026: он прикрывал порядок «сначала код, потом миграция», а
// порядок теперь обратный — и заодно глотал любую другую ошибку, оставляя
// календарь без списка людей, кому вообще можно поставить смену.
async function loadStaff(supabase: Supabase): Promise<StaffMember[]> {
  // Уволенным смену не ставим (0036). Их ПРОШЛЫЕ смены из календаря никуда не
  // деваются: имя в карточке дня приходит из самой смены, а не из этого списка.
  const [hidden, res] = await Promise.all([
    hiddenStaffIds(supabase),
    supabase
      .from("users")
      .select("id, name, role")
      .in("role", ["instructor", "smm", "admin", "mechanic"])
      .order("name"),
  ]);

  failIfReadError(res.error, "не удалось прочитать, кому ставить смену");
  return ((res.data ?? []) as StaffMember[]).filter((u) => !hidden.has(u.id));
}

export async function getMonthCalendar(
  supabase: Supabase,
  ym: string,
): Promise<MonthCalendar> {
  const { fromDay, toDay } = vnMonth(ym);

  const [shiftsRes, bookingsRes, staff] = await Promise.all([
    loadMonthShifts(supabase, fromDay, toDay),
    supabase
      .from("bookings")
      .select(
        "id, client_name, preferred_date, scheduled_time, services(name), accepted:users!accepted_by(name)",
      )
      .eq("status", "confirmed")
      .gte("preferred_date", fromDay)
      .lt("preferred_date", toDay),
    loadStaff(supabase),
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

  return { days, staff };
}

// Флаг users.senior (0033) остался пометкой «кто на смене старший», но фото он
// больше не гейтит: с 27.07.2026 обязательный кадр один и тот же у всех — фото
// на пляже. Оборудование снимает тот, кому удобно, и договариваются об этом
// инструкторы между собой. Поэтому проверки «старший ли ты» здесь больше нет.

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
    .select("id, shift_id, phase, kind, equipment_id, path, equipment(name)")
    .in("shift_id", shiftIds)
    .order("created_at");
  if (error) {
    console.error("[shifts] photos load error:", error.message);
    return map;
  }

  // Сначала RLS определяет, какие строки сотруднику вообще разрешено видеть;
  // только после этого service_role подписывает пути из полученного набора.
  const urls = await createPrivatePhotoUrls(
    "shifts",
    (data ?? []).map((photo) => photo.path as string),
  );

  for (const p of data ?? []) {
    const path = p.path as string;
    const url = urls.get(path);
    // Ошибка подписи одного объекта не должна ломать календарь целиком.
    if (!url) continue;
    const equip = p.equipment as unknown as { name: string } | null;
    const photo: ShiftPhoto = {
      id: p.id as string,
      phase: p.phase as PhotoPhase,
      kind: p.kind as PhotoKind,
      equipmentId: (p.equipment_id as string | null) ?? null,
      equipmentName: equip?.name ?? null,
      path,
      url,
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
