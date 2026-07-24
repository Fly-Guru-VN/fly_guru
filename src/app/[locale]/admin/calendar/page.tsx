import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
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
import {
  assignShiftAction,
  removeShiftAction,
  setShiftBonusAction,
} from "../actions";

export const metadata: Metadata = { title: "Админка · Календарь" };

// Календарь (пак H1): админ ставит инструкторам смены (выходы) на дни и видит
// записи клиентов по дням. Клик по дню открывает карточку дня ПОВЕРХ сетки
// (?d=…, пачка №5 п.9) — чистый SSR, формы внутри остаются server actions.
// Здесь же решается премия за выход: машина считает регламент (открыл до 9:00,
// закрыл после 18:00 — 300 000 ₫), а админ может снять премию руками с
// причиной, если смена была особенной (пачка №9, пак 2).

// Премия за выход в карточке дня: вердикт машины + ручка админа.
//
// Кнопка одна и делает одно действие («снять» либо «вернуть») — переключатель
// с отдельной кнопкой «Сохранить» здесь лишний: решение бинарное, а причина
// нужна только при снятии.
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

export default async function AdminCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; d?: string }>;
}) {
  const { m, d } = await searchParams;
  const ym = resolveCalYm(m);
  const today = vnToday();

  const supabase = await createClient();
  const cal = await getMonthCalendar(supabase, ym);

  // Выбранный день — только если он валиден и относится к открытому месяцу.
  const selected =
    d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d.startsWith(ym) ? d : undefined;
  const dayData = selected ? cal.days.get(selected) : undefined;
  // Смена инструктора на выбранный день (если есть) — для отметки и заметки.
  const shiftByInstr = new Map(
    (dayData?.shifts ?? []).map((s) => [s.instructorId, s]),
  );
  // Фото смен выбранного дня (пак C): подтягиваем только для открытого дня.
  const photosByShift: Map<string, ShiftPhoto[]> = selected
    ? await loadShiftPhotos(
        supabase,
        (dayData?.shifts ?? []).map((s) => s.id),
      )
    : new Map();

  return (
    <div>
      <h1 className="text-2xl font-bold">Календарь</h1>
      <p className="mt-1 text-sm text-muted">
        Ставьте инструкторам смены и смотрите записи по дням. Тап по дню — детали.
      </p>

      <CalMonthNav ym={ym} basePath="/admin/calendar" />

      <div className="mt-3">
        <MonthGrid
          ym={ym}
          today={today}
          selected={selected}
          hrefFor={(date) => `/admin/calendar?m=${ym}&d=${date}`}
          renderCell={(date) => {
            const entry = cal.days.get(date);
            if (!entry) return null;
            return (
              <>
                {entry.shifts.length > 0 && (
                  <div className="space-y-0.5">
                    {entry.shifts.map((s) => (
                      <span
                        key={s.id}
                        title={s.name}
                        className="block truncate rounded bg-accent/15 px-1 text-[10px] font-bold text-accent-strong"
                      >
                        {s.name}
                      </span>
                    ))}
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

      {/* Карточка дня — поверх календаря */}
      {selected && (
        <DayModal title={fmtFullDay(selected)} closeHref={`/admin/calendar?m=${ym}`}>
          <h3 className="text-sm font-bold text-muted">Смены</h3>
          <div className="mt-2 space-y-2">
            {cal.staff.map((u) => {
              const shift = shiftByInstr.get(u.id);
              const photos = shift
                ? (photosByShift.get(shift.id) ?? [])
                : [];
              return (
                <div
                  key={u.id}
                  className="rounded-xl border border-line/70 px-3 py-2.5"
                >
                  {/* На телефоне имя и действие в столбик: кнопка «Смена» с
                      полем заметки в одну строку не помещалась. */}
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <span className="min-w-0 text-sm font-semibold">
                      {shift && <span className="text-accent-strong">🏄 </span>}
                      {u.name}
                      {shift && !shift.planned && (
                        <span className="font-normal text-muted"> · без плана</span>
                      )}
                      {shift?.note && (
                        <span className="font-normal text-muted"> · {shift.note}</span>
                      )}
                    </span>
                    {shift ? (
                      <form action={removeShiftAction} className="shrink-0">
                        <input type="hidden" name="instructorId" value={u.id} />
                        <input type="hidden" name="date" value={selected} />
                        <button
                          type="submit"
                          className="text-xs font-semibold text-muted transition-colors hover:text-red-500"
                        >
                          Убрать смену
                        </button>
                      </form>
                    ) : (
                      <form action={assignShiftAction} className="flex shrink-0 items-center gap-1.5">
                        <input type="hidden" name="instructorId" value={u.id} />
                        <input type="hidden" name="date" value={selected} />
                        <input
                          type="text"
                          name="note"
                          placeholder="заметка"
                          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs outline-none focus:border-primary sm:w-28 sm:flex-none"
                        />
                        <button
                          type="submit"
                          className="shrink-0 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary/90"
                        >
                          Смена
                        </button>
                      </form>
                    )}
                  </div>

                  {/* Факт выхода: во сколько открыл и закрыл смену. Регламент
                      9:00/18:00 — только для инструкторов и админа; у механика
                      его нет, поэтому там голое время (см. ShiftTimes). */}
                  {shift && (
                    <ShiftTimes
                      openedAt={shift.openedAt}
                      closedAt={shift.closedAt}
                      strict={u.role !== "mechanic"}
                    />
                  )}

                  {(shift?.openComment || shift?.closeComment) && (
                    <p className="mt-1.5 text-xs text-muted">
                      {shift.openComment && <>Открытие: {shift.openComment}. </>}
                      {shift.closeComment && <>Закрытие: {shift.closeComment}.</>}
                    </p>
                  )}

                  {/* Премия за выход. У админа её нет: он босс, а не наёмный —
                      показывать ему «премия не начислена» значило бы врать. */}
                  {shift && u.role === "instructor" && (
                    <ShiftBonus shift={shift} date={selected} instructorId={u.id} />
                  )}

                  {/* Фото смены — каждое с подписью, к чему относится */}
                  <ShiftPhotos photos={photos} />
                </div>
              );
            })}
            {cal.staff.length === 0 && (
              <p className="text-sm text-muted">Инструкторов нет.</p>
            )}
          </div>

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
