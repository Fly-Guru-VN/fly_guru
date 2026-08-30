// Даты в часовом поясе школы (Нячанг, UTC+7, без переходов на летнее время).
// Сервер (Vercel) живёт в UTC, поэтому «сегодня» и «текущий месяц» считаем явно.

// Экспортируется: по этому же сдвигу считаются окна брони и отмены
// (lib/bookingWindow) — второй такой константы в проекте быть не должно.
export const VN_OFFSET_MS = 7 * 3600 * 1000;

// Текущий момент, сдвинутый в местное время Вьетнама.
function vnNow(): Date {
  return new Date(Date.now() + VN_OFFSET_MS);
}

// Сегодняшняя дата в Нячанге: 'YYYY-MM-DD' (для колонок типа date).
export function vnToday(): string {
  return vnNow().toISOString().slice(0, 10);
}

// Границы текущего месяца в Нячанге.
// Для колонок date — строки 'YYYY-MM-DD'; для timestamptz — ISO-строки
// момента местной полуночи 1-го числа (в UTC это минус 7 часов).
export function vnCurrentMonth() {
  const now = vnNow();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-based

  const fromDate = new Date(Date.UTC(y, m, 1));
  const toDate = new Date(Date.UTC(y, m + 1, 1));

  return {
    // Для сравнения с date-колонками: date >= from AND date < to
    fromDay: fromDate.toISOString().slice(0, 10),
    toDay: toDate.toISOString().slice(0, 10),
    // Для сравнения с timestamptz (paid_at): местная полночь в UTC
    fromIso: new Date(fromDate.getTime() - VN_OFFSET_MS).toISOString(),
    toIso: new Date(toDate.getTime() - VN_OFFSET_MS).toISOString(),
    // Человекочитаемая метка «июль 2026»
    label: new Intl.DateTimeFormat("ru-RU", {
      month: "long",
      year: "numeric",
      timeZone: "Asia/Ho_Chi_Minh",
    }).format(new Date()),
  };
}

// Границы произвольного месяца 'YYYY-MM' (переключатель месяцев в дашборде).
// Возвращает ту же форму, что vnCurrentMonth.
export function vnMonth(ym: string) {
  const [y, m1] = ym.split("-").map(Number); // m1 — 1-based из URL
  const fromDate = new Date(Date.UTC(y, m1 - 1, 1));
  const toDate = new Date(Date.UTC(y, m1, 1));

  return {
    fromDay: fromDate.toISOString().slice(0, 10),
    toDay: toDate.toISOString().slice(0, 10),
    fromIso: new Date(fromDate.getTime() - VN_OFFSET_MS).toISOString(),
    toIso: new Date(toDate.getTime() - VN_OFFSET_MS).toISOString(),
    label: new Intl.DateTimeFormat("ru-RU", {
      month: "long",
      year: "numeric",
      timeZone: "UTC", // дата уже «местная» — форматируем как есть
    }).format(fromDate),
  };
}

// Произвольный период для статистики: обе даты включительно ('YYYY-MM-DD').
// Возвращает те же границы, что и vnCurrentMonth: правая — эксклюзивная
// (date >= fromDay AND date < toDay), ISO — местная полночь в UTC.
export function vnPeriod(fromDay: string, toDayInclusive: string) {
  const from = new Date(`${fromDay}T00:00:00Z`);
  const to = new Date(`${toDayInclusive}T00:00:00Z`);
  to.setUTCDate(to.getUTCDate() + 1); // включительно → эксклюзивная граница

  return {
    fromDay,
    toDay: to.toISOString().slice(0, 10),
    fromIso: new Date(from.getTime() - VN_OFFSET_MS).toISOString(),
    toIso: new Date(to.getTime() - VN_OFFSET_MS).toISOString(),
  };
}

// Сдвиг даты 'YYYY-MM-DD' на n дней (для пресетов «последние 7 дней» и т.п.).
export function vnShiftDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Границы прошлого месяца в Нячанге (пресет статистики): первая и последняя
// даты месяца, обе включительно — в формате инпутов формы.
export function vnPrevMonth() {
  const now = vnNow();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return {
    fromDay: from.toISOString().slice(0, 10),
    lastDay: vnShiftDays(to.toISOString().slice(0, 10), -1),
  };
}

// ── Недели ───────────────────────────────────────────────────────────────────
// Инструкторам платят раз в неделю, поэтому «Расчёт выплат» умеет считать не
// только месяц. Неделя — понедельник–воскресенье: так её считают и сами
// инструкторы, и график смен.

// Понедельник недели, в которую попадает день 'YYYY-MM-DD'.
function vnMonday(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  // getUTCDay(): 0 — воскресенье, поэтому у него до понедельника не 0, а 6 дней.
  const back = (d.getUTCDay() + 6) % 7;
  return vnShiftDays(day, -back);
}

// Неделя, в которую попадает день (по умолчанию сегодняшний): обе даты
// включительно — та же форма, что у vnPrevMonth, её ждут пресеты периода.
export function vnWeekOf(day: string = vnToday()) {
  const fromDay = vnMonday(day);
  return { fromDay, lastDay: vnShiftDays(fromDay, 6) };
}

// Прошлая неделя — «за что платим сегодня», самый частый случай.
export function vnPrevWeek() {
  return vnWeekOf(vnShiftDays(vnMonday(vnToday()), -1));
}

// Текущая неделя ПО СЕГОДНЯ включительно — период по умолчанию на всех экранах
// с фильтром «С / По» (решение David от 25.08.2026).
//
// Раньше экраны открывались либо месяцем с 1-го числа, либо целой неделей
// пн–вс (vnWeekOf). Второе давало дату из будущего: во вторник в
// поле «По» стояло ближайшее воскресенье, и «заработано за период» считалось по
// дням, которых ещё не было. Теперь правая граница везде одна и та же —
// сегодня, а левая — понедельник этой недели: школа живёт неделями, зарплату
// платят за неделю, и открывать экран логично на ней.
//
// Форма — как у vnPrevWeek: lastDay включительно, его ждут поля формы и
// пресеты.
export function vnWeekToDate() {
  const today = vnToday();
  const fromDay = vnMonday(today);
  return { ...vnPeriod(fromDay, today), fromDay, lastDay: today };
}

// Подпись периода: «3 — 9 августа 2026» (месяц не повторяем, если он один).
// Нужна там, где раньше стояло название месяца, — заголовок расчёта выплат.
export function vnRangeLabel(fromDay: string, lastDay: string): string {
  const fmt = (day: string, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("ru-RU", { ...opts, timeZone: "UTC" }).format(
      new Date(`${day}T00:00:00Z`),
    );
  if (fromDay === lastDay) {
    return fmt(fromDay, { day: "numeric", month: "long", year: "numeric" });
  }
  const sameMonth = fromDay.slice(0, 7) === lastDay.slice(0, 7);
  const left = sameMonth
    ? fmt(fromDay, { day: "numeric" })
    : fmt(fromDay, { day: "numeric", month: "long" });
  return `${left} — ${fmt(lastDay, { day: "numeric", month: "long", year: "numeric" })}`;
}

// Дата продажи + 3 месяца — срок жизни минут абонемента (архитектура, раздел 2).
export function subscriptionExpiry(from: Date = new Date()): Date {
  const d = new Date(from);
  d.setUTCMonth(d.getUTCMonth() + 3);
  return d;
}

// День в Нячанге для момента времени: 'YYYY-MM-DD'. Нужен, когда timestamptz
// надо поставить в один ряд с колонками типа date — например продажу
// абонемента (paid_at) в таблицу визитов рядом с занятиями.
export function vnDay(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Date(d.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

// Чистый день 'YYYY-MM-DD' → «12.07.2026». Разбором строки, а не через Date:
// у даты без времени часового пояса нет, и new Date() увёл бы её на день назад
// (сервер живёт в UTC, а школа — в UTC+7).
export function dayLabel(day: string | null | undefined): string {
  if (!day) return "—";
  const [y, m, d] = day.split("-");
  return y && m && d ? `${d}.${m}.${y}` : day;
}

// ── Подписи дат: один набор на все экраны ────────────────────────────────────
//
// Зачем это здесь (ревизия 15.08.2026). По кабинетам жили ДЕСЯТЬ самодельных
// функций с именами fmtDay / dayLabel / fmtFullDay, и делали они РАЗНОЕ:
// половина считала в UTC (так и надо для чистых дат 'YYYY-MM-DD'), половина —
// в поясе Нячанга (так и надо для меток времени). Имена при этом совпадали, в
// том числе с dayLabel выше. Скопировал функцию из соседнего экрана — и дата
// молча уехала на день, а в школе, где день закрывается кассой, это замечают
// через неделю.
//
// Правило простое: имя говорит, ЧТО на входе.
//   • day* — чистая дата 'YYYY-MM-DD' (колонки типа date). Считаем в UTC.
//   • moment* — метка времени (timestamptz). Считаем в поясе Нячанга.

const asUtcDate = (day: string) => new Date(`${day}T00:00:00Z`);

/** 'YYYY-MM-DD' → «15 авг.». Короткая подпись для карточек и таблиц. */
export function dayShort(day: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(asUtcDate(day));
}

/** 'YYYY-MM-DD' → «15 августа 2026 г.». Для лент, где дата — заголовок. */
export function dayLong(day: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(asUtcDate(day));
}

/** 'YYYY-MM-DD' → «суббота, 15 августа». Заголовок дня в календарях. */
export function dayWithWeekday(day: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(asUtcDate(day));
}

/** 'YYYY-MM' или 'YYYY-MM-DD' → «август 2026 г.». */
export function monthLabel(day: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(asUtcDate(day.length === 7 ? `${day}-01` : day));
}

/**
 * 'YYYY-MM' или 'YYYY-MM-DD' → «август», без года. Для подписей, где месяц и
 * так текущий: в чипе «1% за …» год съедал ширину и ломал строку на телефоне.
 */
export function monthName(day: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    timeZone: "UTC",
  }).format(asUtcDate(day.length === 7 ? `${day}-01` : day));
}

/** Метка времени → «15.08.2026» по времени Нячанга. Пусто → «—». */
export function momentDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(iso));
}

// Час и минута момента по времени Нячанга. Нужны правилам смены (пак C):
// «открыл до 9:00» и «закрыл после 18:00» считаются по местным часам, а не по
// UTC сервера — иначе граница уезжала бы на семь часов.
export function vnClock(iso: string | Date): { hour: number; minute: number } {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const local = new Date(d.getTime() + VN_OFFSET_MS);
  return { hour: local.getUTCHours(), minute: local.getUTCMinutes() };
}

// «08:42» по Нячангу — для показа времени открытия/закрытия смены.
export function vnTimeLabel(iso: string | Date | null): string {
  if (!iso) return "—";
  const { hour, minute } = vnClock(iso);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

// Момент 'YYYY-MM-DD' + 'HH:MM' по Нячангу как ISO для timestamptz. Нужен
// админу, когда он правит время открытия/закрытия смены руками: в форме он
// вводит МЕСТНОЕ время, а в базе лежит UTC. null — время невалидное.
export function vnIsoAt(day: string, time: string): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  const local = new Date(`${day}T00:00:00Z`);
  local.setUTCHours(hour, minute, 0, 0);
  return new Date(local.getTime() - VN_OFFSET_MS).toISOString();
}

// «23.07 в 14:32» по Нячангу — момент, когда запись реально внесли в CRM
// (sessions.created_at, subscriptions.sold_at). Это НЕ дата занятия: сессию
// заводят и задним числом, и именно поэтому время внесения показываем
// отдельной строкой — иначе непонятно, кто и когда что-то добавил в базу
// (пачка №9, пак 3, п.4).
export function vnEnteredLabel(iso: string | Date | null): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const local = new Date(d.getTime() + VN_OFFSET_MS);
  const day = String(local.getUTCDate()).padStart(2, "0");
  const month = String(local.getUTCMonth() + 1).padStart(2, "0");
  return `${day}.${month} в ${vnTimeLabel(iso)}`;
}
