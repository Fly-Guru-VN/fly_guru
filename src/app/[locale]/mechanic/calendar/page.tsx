import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getAppUser } from "@/lib/auth";
import { vnToday } from "@/lib/dates";
import {
  getMonthCalendar,
  loadShiftPhotos,
  type ShiftEntry,
  type ShiftPhoto,
} from "@/lib/shifts";
import { SHIFT_PAY, SHIFT_PAY_LABEL, shiftPayStatus } from "@/lib/salary";
import { vnd } from "@/lib/stats";
import { MonthGrid } from "@/components/cabinet/MonthGrid";
import { CalMonthNav, resolveCalYm } from "@/components/cabinet/CalMonthNav";
import { DayModal } from "@/components/cabinet/DayModal";
import { ShiftPhotos } from "@/components/cabinet/ShiftPhotos";
import { ShiftTimes } from "@/components/cabinet/ShiftTimes";
import { setShiftBonusAction } from "../../admin/actions";

export const metadata: Metadata = { title: "Механик · Календарь" };

// Календарь механика — то же, что видит админ, но смены он не ставит и не
// убирает (это дело админа) и своей ЗП здесь нет. Что осталось от админского
// экрана: все смены дня с временем, комментариями и ВСЕМИ фотографиями, записи
// клиентов и премия за выход. Премию механик снимает наравне с админом: он
// первым видит, в каком состоянии вернули доски, и именно ему потом чинить.

// Премия за выход. Копия блока из админского календаря — тот же экшен, тот же
// текст; разошлись бы формулировки, разошлось бы и понимание, за что снимают.
function ShiftBonus({
  shift,
  date,
  instructorId,
}: {
  shift: ShiftEntry;
  date: string;
  instructorId: string;
}) {
  const status = shiftPayStatus(
    shift.openedAt,
    shift.closedAt,
    shift.bonusCancelled,
  );
  const paid = status === "paid";

  return (
    <div className="mt-2 rounded-xl bg-line/25 px-3 py-2">
      <p className="text-xs font-semibold">
        {paid ? (
          <span className="text-primary">Премия {vnd(SHIFT_PAY)} · зачтена</span>
        ) : (
          <span className="text-muted">
            Премия не начислена · {SHIFT_PAY_LABEL[status]}
          </span>
        )}
      </p>
      {shift.bonusCancelled && shift.bonusComment && (
        <p className="mt-0.5 text-xs text-muted">Причина: {shift.bonusComment}</p>
      )}

      <form action={setShiftBonusAction} className="mt-2 flex items-center gap-1.5">
        <input type="hidden" name="instructorId" value={instructorId} />
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="cancelled" value={shift.bonusCancelled ? "0" : "1"} />
        {!shift.bonusCancelled && (
          <input
            type="text"
            name="comment"
            placeholder="причина"
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs outline-none focus:border-primary"
          />
        )}
        <button
          type="submit"
          className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
            shift.bonusCancelled
              ? "border-line text-muted hover:border-primary hover:text-primary"
              : "border-line text-muted hover:border-red-500 hover:text-red-500"
          }`}
        >
          {shift.bonusCancelled ? "Вернуть премию" : "Снять премию"}
        </button>
      </form>
    </div>
  );
}

function fmtFullDay(d: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${d}T00:00:00Z`));
}

export default async function MechanicCalendarPage({
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

  // Роль владельца смены: у инструктора работает регламент 9:00/18:00 и премия,
  // у механика — нет (см. ShiftTimes).
  const roleById = new Map(cal.staff.map((s) => [s.id, s.role]));

  // Фото всех смен выбранного дня — одним запросом.
  const photosByShift: Map<string, ShiftPhoto[]> = selected
    ? await loadShiftPhotos(supabase, (dayData?.shifts ?? []).map((s) => s.id))
    : new Map();

  return (
    <div>
      <h1 className="text-2xl font-bold">Календарь</h1>
      <p className="mt-1 text-sm text-muted">
        Кто на смене и какие записи по дням. Тап по дню — детали и фото смен.
      </p>

      <CalMonthNav ym={ym} basePath="/mechanic/calendar" />

      <div className="mt-3">
        <MonthGrid
          ym={ym}
          today={today}
          selected={selected}
          hrefFor={(date) => `/mechanic/calendar?m=${ym}&d=${date}`}
          renderCell={(date) => {
            const entry = cal.days.get(date);
            if (!entry) return null;
            return (
              <>
                {entry.shifts.length > 0 && (
                  <div className="space-y-0.5">
                    {entry.shifts.map((s) => {
                      const mine = s.instructorId === user.id;
                      return (
                        <span
                          key={s.id}
                          title={s.name}
                          className={`block truncate rounded px-1 text-[10px] font-bold ${
                            mine
                              ? "bg-primary text-white"
                              : "bg-accent/15 text-accent-strong"
                          }`}
                        >
                          {s.name}
                        </span>
                      );
                    })}
                  </div>
                )}
                {entry.bookings.length > 0 && (
                  <span className="inline-block rounded bg-primary/10 px-1 text-[10px] font-semibold text-primary">
                    {entry.bookings.length} зап.
                  </span>
                )}
              </>
            );
          }}
        />
      </div>

      {/* Карточка дня поверх календаря */}
      {selected && (
        <DayModal
          title={fmtFullDay(selected)}
          closeHref={`/mechanic/calendar?m=${ym}`}
        >
          <h3 className="text-sm font-bold text-muted">На смене</h3>
          {dayData && dayData.shifts.length > 0 ? (
            <div className="mt-2 space-y-2">
              {dayData.shifts.map((s) => {
                const mine = s.instructorId === user.id;
                const role = roleById.get(s.instructorId);
                return (
                  <div
                    key={s.id}
                    className="rounded-xl border border-line/70 px-3 py-2.5"
                  >
                    <p className="text-sm font-semibold">
                      {mine && <span className="text-primary">🔧 </span>}
                      {s.name}
                      {mine && <span className="font-normal text-muted"> · вы</span>}
                      {s.note && (
                        <span className="font-normal text-muted"> · {s.note}</span>
                      )}
                    </p>

                    <ShiftTimes
                      openedAt={s.openedAt}
                      closedAt={s.closedAt}
                      strict={role !== "mechanic"}
                    />

                    {(s.openComment || s.closeComment) && (
                      <p className="mt-1.5 text-xs text-muted">
                        {s.openComment && <>Открытие: {s.openComment}. </>}
                        {s.closeComment && <>Закрытие: {s.closeComment}.</>}
                      </p>
                    )}

                    {/* Премия — только у наёмных инструкторов: у админа её нет,
                        у механика своя схема оплаты. */}
                    {role === "instructor" && (
                      <ShiftBonus
                        shift={s}
                        date={selected}
                        instructorId={s.instructorId}
                      />
                    )}

                    <ShiftPhotos photos={photosByShift.get(s.id) ?? []} />
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
