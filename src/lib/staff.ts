import type { createClient } from "@/lib/supabase/server";
import { vnToday } from "@/lib/dates";

// Штат школы во времени: кто когда пришёл и кто когда ушёл (миграция 0036).
//
// До этого «инструктор» был просто ролью: список людей с role = 'instructor'
// считался актуальным всегда. Уволить человека можно было только удалением
// строки — и вместе с ней из истории пропадало, кто провёл занятие и кому уже
// заплатили. Поэтому увольнение теперь дата, а не delete:
//
//   hired_at — первый рабочий день (пусто = «был всегда»),
//   left_at  — ПОСЛЕДНИЙ рабочий день (пусто = работает сейчас).
//
// Обе границы включительно: «уволен 5 августа» = пятое он ещё отработал,
// шестого его в штате нет.
//
// Что от этого зависит:
//   • списки в формах (кто провёл, кто продал, кому ставить смену) — только
//     действующие: уволенного нельзя выбрать по ошибке;
//   • дележ котла абонементов — каждый абонемент делится между теми, кто был в
//     штате В ДЕНЬ ЕГО ОПЛАТЫ (см. lib/salary → getSubsShares);
//   • вход в кабинет — уволенному закрыт (lib/auth, login/actions).
// Что НЕ зависит: выходы и 15% с занятий. Они привязаны к фактическим сменам и
// сессиям, а их уволенный больше не заводит — история за отработанные дни
// считается ровно так же, как считалась.

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface StaffMember {
  id: string;
  name: string;
  hiredAt: string | null; // первый рабочий день, включительно
  leftAt: string | null; // последний рабочий день, включительно
  senior: boolean;
}

// Работал ли человек в этот день. Обе границы включительно.
export function worksOn(m: StaffMember, day: string): boolean {
  if (m.hiredAt && day < m.hiredAt) return false;
  if (m.leftAt && day > m.leftAt) return false;
  return true;
}

// Уволен ли (по состоянию на сегодня). Дата увольнения может стоять в будущем —
// «последний день пятница»: до пятницы человек ещё в штате.
export function isFired(m: StaffMember, today: string = vnToday()): boolean {
  return Boolean(m.leftAt && today > m.leftAt);
}

// Ещё не вышел на работу: приняли с завтрашнего числа.
export function notStarted(m: StaffMember, today: string = vnToday()): boolean {
  return Boolean(m.hiredAt && today < m.hiredAt);
}

// Весь список инструкторов, включая уволенных: он нужен расчётам за прошлые
// периоды (уволенному платят за отработанную неделю) и странице Настроек.
// Колонки трудового периода появились в 0036, а деплой у David едет раньше
// наката миграции — при «нет такой колонки» перечитываем без них (та же
// страховка, что у bonus_cancelled в lib/salary).
export async function loadInstructors(client: Supabase): Promise<StaffMember[]> {
  return loadByRole(client, "instructor");
}

// СММщик считается тем же штатом: у него есть даты приёма и увольнения, он
// попадает в «Расчёт выплат» и получает отметки о выплате в той же таблице.
// Отличается только формула ЗП (фикс за неделю — см. lib/salary), а не список.
export async function loadSmm(client: Supabase): Promise<StaffMember[]> {
  return loadByRole(client, "smm");
}

// Механик и админ зарплату НЕ зарабатывают по формуле — им платят фиксом, о
// котором система знать не может. В расчёте долгов их поэтому нет, а вот в
// форме выплаты они нужны: иначе выдачу этих денег некуда записать, и она
// оседает только в ручных расходах (см. payroll → payees).
export async function loadMechanics(client: Supabase): Promise<StaffMember[]> {
  return loadByRole(client, "mechanic");
}

export async function loadDevs(client: Supabase): Promise<StaffMember[]> {
  return loadByRole(client, "dev");
}

export async function loadAdmins(client: Supabase): Promise<StaffMember[]> {
  return loadByRole(client, "admin");
}

async function loadByRole(
  client: Supabase,
  role: "instructor" | "smm" | "mechanic" | "admin" | "dev",
): Promise<StaffMember[]> {
  const base = "id, name, senior";
  const full = `${base}, hired_at, left_at`;

  const query = (columns: string) =>
    client.from("users").select(columns).eq("role", role).order("name");

  let rows: Record<string, unknown>[] | null = null;
  const { data, error } = await query(full);
  if (!error) {
    rows = data as unknown as Record<string, unknown>[];
  } else {
    const { data: plain, error: plainError } = await query(base);
    if (plainError) {
      console.error("[staff] load error:", plainError.message);
      return [];
    }
    rows = plain as unknown as Record<string, unknown>[];
  }

  return (rows ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    hiredAt: (r.hired_at as string | null) ?? null,
    leftAt: (r.left_at as string | null) ?? null,
    senior: Boolean(r.senior),
  }));
}

// Кто мог провести занятие или продать абонемент: инструкторы и хозяева
// админки (админ и разработчик). Список для выпадашек «кто откатал» / «кто
// продал» на трёх экранах — пусть он собирается в одном месте.
//
// Роль dev появилась в 0044. Пока миграция не накатана, Postgres не знает
// такого значения enum и роняет ВЕСЬ запрос (22P02), а не отбрасывает лишнее
// значение, — список молча оказался бы пустым, и записать клиента стало бы
// не на кого. Поэтому при ошибке повторяем запрос без новой роли: порядок
// «сначала код, потом миграция» перестаёт что-либо ломать.
export async function loadSessionStaff(
  client: Supabase,
): Promise<{ id: string; name: string }[]> {
  const query = (roles: string[]) =>
    client.from("users").select("id, name").in("role", roles).order("name");

  const { data, error } = await query(["instructor", "admin", "dev"]);
  if (!error) return (data ?? []) as { id: string; name: string }[];

  const { data: legacy, error: legacyError } = await query([
    "instructor",
    "admin",
  ]);
  if (legacyError) {
    console.error("[staff] session staff load error:", legacyError.message);
    return [];
  }
  return (legacy ?? []) as { id: string; name: string }[];
}

// Действующие на сегодня — для выпадающих списков в формах.
export function activeStaff(
  staff: StaffMember[],
  today: string = vnToday(),
): StaffMember[] {
  return staff.filter((m) => !isFired(m, today) && !notStarted(m, today));
}

// Кто был в штате в конкретный день — для дележа денег этого дня.
export function staffOn(staff: StaffMember[], day: string): StaffMember[] {
  return staff.filter((m) => worksOn(m, day));
}

// Подпись трудового периода для админских экранов: «уволен 5 авг», «с 12 авг».
export function employmentLabel(
  m: StaffMember,
  today: string = vnToday(),
): string | null {
  const d = (day: string) =>
    new Date(`${day}T00:00:00`).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "short",
    });
  if (isFired(m, today)) return `уволен ${d(m.leftAt!)}`;
  if (m.leftAt) return `последний день ${d(m.leftAt)}`;
  if (notStarted(m, today)) return `выходит ${d(m.hiredAt!)}`;
  if (m.hiredAt) return `с ${d(m.hiredAt)}`;
  return null;
}

// Работал ли человек хоть один день внутри периода. Нужно «Расчёту выплат»:
// уволенный в среду должен остаться в списке за эту неделю (ему платят
// напоследок), но исчезнуть из следующей.
export function employedDuring(
  m: StaffMember,
  fromDay: string,
  lastDay: string,
): boolean {
  if (m.leftAt && m.leftAt < fromDay) return false;
  if (m.hiredAt && m.hiredAt > lastDay) return false;
  return true;
}

// Кого прятать из выпадающих списков «кто провёл / кто продал / кому ставить
// смену»: уволенные и ещё не вышедшие. Отдельной функцией, а не фильтром внутри
// каждого запроса, потому что списки везде собираются по-разному (где-то роли
// instructor+admin, где-то ещё и механик, и у каждого свои страховки на случай
// ненакатанной миграции). Дешевле один маленький запрос по маленькой таблице.
export async function hiddenStaffIds(
  client: Supabase,
  today: string = vnToday(),
): Promise<Set<string>> {
  const staff = await loadInstructors(client);
  return new Set(
    staff.filter((m) => isFired(m, today) || notStarted(m, today)).map((m) => m.id),
  );
}
