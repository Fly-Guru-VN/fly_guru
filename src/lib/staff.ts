import type { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth";
import { vnToday } from "@/lib/dates";
import { failIfReadError } from "@/lib/dbError";

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
// Для денег обе границы включительно: «уволен 5 августа» = пятое он ещё
// отработал (см. worksOn), и ЗП с долями за этот день считаются как обычно.
// А вот из штата человек выходит В САМ этот день: пятого он уже не появится в
// списках и не войдёт в кабинет (см. isFired).
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
  role: AppRole; // кем человек числится: от роли зависит формула ЗП
  hiredAt: string | null; // первый рабочий день, включительно
  leftAt: string | null; // последний рабочий день, включительно
  senior: boolean;
}

// Кто зарабатывает ПО-СМЕННОЙ формуле: 200 000 ₫ за выход по регламенту, доля
// 15% с занятий дня и доля котла абонементов (см. lib/salary).
//
// Раньше этим признаком была сама роль 'instructor', зашитая в пять расчётов.
// С 21.08.2026 (решение David) смену открывает ЛЮБОЙ сотрудник, и СММщик,
// вышедший на пляж вместо офиса, зарабатывает ровно как инструктор — руками
// такие дни в расчёт больше не вносим. Список здесь один на всю систему:
// добавится ещё одна «полевая» роль — правится одна строка.
//
// Кого тут намеренно нет:
//   • механик — у него фикс 10 млн в месяц (MECHANIC_MONTH_PAY), за смену он
//     не получает ничего, хотя открывает её так же;
//   • админ и разработчик — они боссы: их выход не оплачивается, а их занятия
//     не наполняют 15% инструкторов (та же логика, что в lib/finance).
export const SHIFT_CREW_ROLES: AppRole[] = ["instructor", "smm"];

export function inShiftCrew(role: AppRole): boolean {
  return SHIFT_CREW_ROLES.includes(role);
}

// Работал ли человек в этот день. Обе границы включительно.
export function worksOn(m: StaffMember, day: string): boolean {
  if (m.hiredAt && day < m.hiredAt) return false;
  if (m.leftAt && day > m.leftAt) return false;
  return true;
}

// Уволен ли (по состоянию на сегодня). Дата увольнения может стоять в будущем —
// «последний день пятница»: до пятницы человек ещё в штате.
//
// Сегодняшнее число = уволен уже сейчас (19.08.2026). Раньше сравнение было
// строгим (today > leftAt), и увольнение сегодняшним днём не давало на экране
// ничего: человек оставался в работающих, в выпадашках и мог войти в кабинет —
// до завтра. Со стороны это читалось как сломанная кнопка «Уволить». На деньги
// правка не влияет: последний день оплачивается через worksOn, а он границу
// по-прежнему включает.
export function isFired(m: StaffMember, today: string = vnToday()): boolean {
  return Boolean(m.leftAt && today >= m.leftAt);
}

// Ещё не вышел на работу: приняли с завтрашнего числа.
export function notStarted(m: StaffMember, today: string = vnToday()): boolean {
  return Boolean(m.hiredAt && today < m.hiredAt);
}

// Весь список инструкторов, включая уволенных: он нужен расчётам за прошлые
// периоды (уволенному платят за отработанную неделю) и странице Настроек.
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

// Полевой состав: все, кому ЗП считается по сменам (см. SHIFT_CREW_ROLES).
// Именно этот список получают расчёты ЗП вместо прежнего loadInstructors —
// «инструктор» перестал быть синонимом «тот, кому платят за выход».
export async function loadShiftCrew(client: Supabase): Promise<StaffMember[]> {
  return loadByRole(client, SHIFT_CREW_ROLES);
}

async function loadByRole(
  client: Supabase,
  role: AppRole | AppRole[],
): Promise<StaffMember[]> {
  const roles = Array.isArray(role) ? role : [role];
  const { data, error } = await client
    .from("users")
    .select("id, name, role, senior, hired_at, left_at")
    .in("role", roles)
    .order("name");

  // Пустой список штата — это не «никого нет», а поломка: без него не
  // посчитается ни ЗП, ни котёл абонементов, и экраны покажут нули как факт.
  failIfReadError(error, `не удалось прочитать список (${roles.join(", ")})`);

  const rows = (data ?? []) as unknown as Record<string, unknown>[];

  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    role: r.role as AppRole,
    hiredAt: (r.hired_at as string | null) ?? null,
    leftAt: (r.left_at as string | null) ?? null,
    senior: Boolean(r.senior),
  }));
}

// Кто мог провести занятие или продать абонемент: инструкторы и хозяева
// админки (админ и разработчик). Список для выпадашек «кто откатал» / «кто
// продал» на трёх экранах — пусть он собирается в одном месте.
//
// Роль dev появилась в 0044 и в боевой базе есть (проверено 15.08.2026).
// Повтор запроса без неё убран: он прикрывал порядок «сначала код, потом
// миграция», а порядок теперь обратный.
//
// СММщик здесь с 21.08.2026: он выходит на смену и катает клиентов сам, а
// занятие, оформленное не на того, кто его провёл, ломает и его 15%, и дележ
// дня между сменщиками.
export async function loadSessionStaff(
  client: Supabase,
): Promise<{ id: string; name: string }[]> {
  const { data, error } = await client
    .from("users")
    .select("id, name")
    .in("role", ["instructor", "smm", "admin", "dev"])
    .order("name");

  // Пустой список = «записать клиента не на кого». Такое лучше увидеть.
  failIfReadError(error, "не удалось прочитать, кто проводит занятия");
  return (data ?? []) as { id: string; name: string }[];
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
// каждого запроса, потому что списки везде собираются по-разному: где-то роли
// instructor+admin, где-то ещё и механик. Дешевле один маленький запрос по
// маленькой таблице.
export async function hiddenStaffIds(
  client: Supabase,
  today: string = vnToday(),
): Promise<Set<string>> {
  const staff = await loadShiftCrew(client);
  return new Set(
    staff.filter((m) => isFired(m, today) || notStarted(m, today)).map((m) => m.id),
  );
}
