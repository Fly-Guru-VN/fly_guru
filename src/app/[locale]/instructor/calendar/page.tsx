import { createClient } from "@/lib/supabase/server";
import { getAppUser } from "@/lib/auth";
import { vnToday, vnTimeLabel } from "@/lib/dates";
import { getMonthCalendar, loadShiftPhotos } from "@/lib/shifts";
import { shiftStatus, OPEN_LABEL, CLOSE_LABEL, statusClass } from "@/lib/shiftRules";
import { MonthGrid } from "@/components/cabinet/MonthGrid";
import { CalendarDayCell } from "@/components/cabinet/CalendarDayCell";
import { CalMonthNav, resolveCalYm } from "@/components/cabinet/CalMonthNav";
import { DayModal } from "@/components/cabinet/DayModal";
import { ShiftPhotos } from "@/components/cabinet/ShiftPhotos";

// Календарь инструктора (пак H1) — read-only. Свои смены подсвечены, видно и
// команду (кто когда работает), и записи клиентов по дням. Смены ставит админ.
// Тап по дню открывает карточку дня поверх сетки (пачка №5, п.9); фото в ней
// показываем только свои — чужие смены инструктору не нужны.

function fmtFullDay(d: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${d}T00:00:00Z`));
}

export default async function InstructorCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; d?: string }>;
}) {
  const { m, d } = await searchParams;
  const ym = resolveCalYm(m);
  const today = vnToday();

  const user = await getAppUser();
  if (!user) return null; // layout уже средиректил бы; страховка для типов

  const supabase = await createClient();
  const cal = await getMonthCalendar(supabase, ym);

  const selected =
    d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d.startsWith(ym) ? d : undefined;
  const dayData = selected ? cal.days.get(selected) : undefined;

  // Своя смена выбранного дня — только её фото и подтягиваем.
  const myShift = dayData?.shifts.find((s) => s.instructorId === user.id);
  const myPhotos = myShift
    ? ((await loadShiftPhotos(supabase, [myShift.id])).get(myShift.id) ?? [])
    : [];

  return (
    <div>
      <h1 className="text-2xl font-bold">Календарь</h1>
      <p className="mt-1 text-sm text-muted">
        Ваши смены подсвечены. Видно команду и записи клиентов по дням. Смены
        ставит админ.
      </p>

      <CalMonthNav ym={ym} basePath="/instructor/calendar" />

      <div className="mt-3">
        <MonthGrid
          ym={ym}
          today={today}
          selected={selected}
          hrefFor={(date) => `/instructor/calendar?m=${ym}&d=${date}`}
          renderCell={(date) => {
            const entry = cal.days.get(date);
            if (!entry) return null;
            return (
              <CalendarDayCell
                shifts={entry.shifts.map((s) => ({
                  id: s.id,
                  name: s.name,
                  mine: s.instructorId === user.id,
                }))}
                bookings={entry.bookings.length}
              />
            );
          }}
        />
      </div>

      {/* Карточка дня поверх календаря (read-only) */}
      {selected && (
        <DayModal
          title={fmtFullDay(selected)}
          closeHref={`/instructor/calendar?m=${ym}`}
        >
          <h3 className="text-sm font-bold text-muted">На смене</h3>
          {dayData && dayData.shifts.length > 0 ? (
            <div className="mt-2 space-y-2">
              {dayData.shifts.map((s) => {
                const mine = s.instructorId === user.id;
                const status = shiftStatus(s.openedAt, s.closedAt);
                return (
                  <div
                    key={s.id}
                    className="rounded-xl border border-line/70 px-3 py-2.5"
                  >
                    <p className="text-sm font-semibold">
                      {mine && <span className="text-primary">🏄 </span>}
                      {s.name}
                      {mine && <span className="font-normal text-muted"> · вы</span>}
                      {s.note && (
                        <span className="font-normal text-muted"> · {s.note}</span>
                      )}
                    </p>

                    {/* Время открытия и закрытия смены */}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {s.openedAt ? (
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(
                            status.open === "late",
                          )}`}
                        >
                          Открыл {vnTimeLabel(s.openedAt)} · {OPEN_LABEL[status.open]}
                        </span>
                      ) : (
                        <span className="rounded-full bg-line/40 px-2.5 py-1 text-xs font-semibold text-muted">
                          Не открыл
                        </span>
                      )}
                      {s.closedAt ? (
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(
                            status.close === "early",
                          )}`}
                        >
                          Закрыл {vnTimeLabel(s.closedAt)} · {CLOSE_LABEL[status.close]}
                        </span>
                      ) : s.openedAt ? (
                        <span className="rounded-full bg-line/40 px-2.5 py-1 text-xs font-semibold text-muted">
                          Не закрыл
                        </span>
                      ) : null}
                    </div>

                    {/* Фото — только своей смены, каждое с подписью */}
                    {mine && <ShiftPhotos photos={myPhotos} />}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted">Смен на этот день нет.</p>
          )}

          <h3 className="mt-5 text-sm font-bold text-muted">Записи клиентов</h3>
          {dayData && dayData.bookings.length > 0 ? (
            <div className="mt-2 space-y-2">
              {dayData.bookings.map((b) => (
                <div
                  key={b.id}
                  className="rounded-xl border border-line/70 px-3 py-2 text-sm"
                >
                  <p className="font-semibold">
                    {b.time ?? "—"} · {b.clientName}
                  </p>
                  {(b.serviceName || b.acceptedName) && (
                    <p className="text-xs text-muted">
                      {[b.serviceName, b.acceptedName && `принял ${b.acceptedName}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted">Записей на этот день нет.</p>
          )}
        </DayModal>
      )}
    </div>
  );
}
