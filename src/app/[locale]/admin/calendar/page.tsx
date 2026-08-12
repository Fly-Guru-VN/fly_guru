import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { vnTimeLabel, vnToday } from "@/lib/dates";
import {
  getMonthCalendar,
  loadShiftPhotos,
  type ShiftEntry,
  type ShiftPhoto,
} from "@/lib/shifts";
import { SHIFT_PAY, SHIFT_PAY_LABEL, shiftPayStatus } from "@/lib/salary";
import { getDayPayments } from "@/lib/payments";
import { vnd } from "@/lib/stats";
import { MonthGrid } from "@/components/cabinet/MonthGrid";
import { CalendarDayCell } from "@/components/cabinet/CalendarDayCell";
import { CalMonthNav, resolveCalYm } from "@/components/cabinet/CalMonthNav";
import { DayModal } from "@/components/cabinet/DayModal";
import { ShiftPhotos } from "@/components/cabinet/ShiftPhotos";
import { ShiftTimes } from "@/components/cabinet/ShiftTimes";
import { NATIVE_PICKER } from "@/components/cabinet/fieldClasses";
import {
  assignShiftAction,
  removeShiftAction,
  setShiftBonusAction,
  setShiftTimesAction,
} from "../actions";
import { PageHeader } from "@/components/cabinet/PageHeader";

export const metadata: Metadata = { title: "Админка · Календарь" };

// Календарь (пак H1): админ ставит инструкторам смены (выходы) на дни и видит
// записи клиентов по дням. Клик по дню открывает карточку дня ПОВЕРХ сетки
// (?d=…, пачка №5 п.9) — чистый SSR, формы внутри остаются server actions.
// Здесь же решается премия за выход: машина считает регламент (открыл до 9:00,
// закрыл после 18:00 — 200 000 ₫), а админ может снять премию руками с
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

// Правка времени смены руками (setShiftTimesAction). Обычно не нужна — время
// ставит сервер по фото, — поэтому прячем под раскрытие, чтобы не выглядело
// частью повседневной работы.
function ShiftTimesEdit({
  shift,
  date,
  instructorId,
}: {
  shift: ShiftEntry;
  date: string;
  instructorId: string;
}) {
  const field =
    "w-28 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs outline-none focus:border-primary";

  return (
    <details className="group mt-2 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-muted">
        Поправить время
        <span className="transition-transform group-open:rotate-180">▾</span>
      </summary>
      <form
        action={setShiftTimesAction}
        className="mt-2 flex flex-wrap items-end gap-2"
      >
        <input type="hidden" name="instructorId" value={instructorId} />
        <input type="hidden" name="date" value={date} />
        <label className="text-[11px] text-muted">
          Открыл
          <input
            type="time"
            name="opened"
            defaultValue={vnTimeInput(shift.openedAt)}
            className={`mt-1 block ${NATIVE_PICKER} ${field}`}
          />
        </label>
        <label className="text-[11px] text-muted">
          Закрыл
          <input
            type="time"
            name="closed"
            defaultValue={vnTimeInput(shift.closedAt)}
            className={`mt-1 block ${NATIVE_PICKER} ${field}`}
          />
        </label>
        <button
          type="submit"
          className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-primary hover:text-primary"
        >
          Сохранить
        </button>
        <p className="w-full text-[11px] text-muted">
          Время местное. Пустое поле сотрёт отметку.
        </p>
      </form>
    </details>
  );
}

// Значение для input[type=time] — то же местное время, что в плашках, но в
// формате поля. Пустая строка, если отметки нет.
function vnTimeInput(iso: string | null): string {
  return iso ? vnTimeLabel(iso) : "";
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
  // Кто в этот день на смене — наверх. Раньше список шёл строго по алфавиту, и
  // сверху карточки висели те, кто сегодня вообще не работает, а реальные смены
  // приходилось искать ниже. Внутри группы «на смене» — по времени открытия
  // (кто пришёл раньше, тот выше; ещё не открывшие — в конце группы), дальше по
  // имени, чтобы порядок не прыгал.
  const staff = [...cal.staff].sort((a, b) => {
    const sa = shiftByInstr.get(a.id);
    const sb = shiftByInstr.get(b.id);
    if (Boolean(sa) !== Boolean(sb)) return sa ? -1 : 1;
    if (sa && sb) {
      const oa = sa.openedAt ?? "￿";
      const ob = sb.openedAt ?? "￿";
      if (oa !== ob) return oa < ob ? -1 : 1;
    }
    return a.name.localeCompare(b.name, "ru");
  });

  // Фото смен выбранного дня (пак C): подтягиваем только для открытого дня.
  const photosByShift: Map<string, ShiftPhoto[]> = selected
    ? await loadShiftPhotos(
        supabase,
        (dayData?.shifts ?? []).map((s) => s.id),
      )
    : new Map();

  // Касса дня по способам оплаты (пачка №15, п.4). Живёт в карточке дня, а не
  // в Статистике: вопрос «сколько сегодня взяли наличными» — про конкретный
  // день, а карточка дня и есть единственный экран про один день.
  const payments = selected ? await getDayPayments(supabase, selected) : null;

  return (
    <div>
      {/* Шапка как на остальных вкладках, а переключатель месяца — в её же
          строке: отдельным ярусом он занимал место над сеткой. На телефоне
          остаётся широкой полосой под шапкой — там в стрелки жмут пальцем. */}
      <PageHeader
        title="Календарь"
        hint="Смены и записи по дням; клик по дню — детали"
        action={
          <div className="hidden sm:block">
            <CalMonthNav ym={ym} basePath="/admin/calendar" className="mt-0" />
          </div>
        }
      />

      <div className="sm:hidden">
        <CalMonthNav ym={ym} basePath="/admin/calendar" />
      </div>

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
              <CalendarDayCell
                shifts={entry.shifts.map((s) => ({ id: s.id, name: s.name }))}
                bookings={entry.bookings.length}
              />
            );
          }}
        />
      </div>

      {/* Карточка дня — поверх календаря */}
      {selected && (
        <DayModal
          title={fmtFullDay(selected)}
          closeHref={`/admin/calendar?m=${ym}`}
          wide
        >
          {/* На ПК — две колонки: слева смены, справа касса и записи. Одной
              простынёй касса и записи уезжали под список из пяти-шести смен, и
              до них приходилось прокручивать всю карточку. */}
          <div className="lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start lg:gap-6">
          <section>
          <h3 className="text-sm font-bold text-muted">Смены</h3>
          <div className="mt-2 space-y-2">
            {staff.map((u) => {
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
                    <>
                      <ShiftTimes
                        openedAt={shift.openedAt}
                        closedAt={shift.closedAt}
                        strict={u.role !== "mechanic"}
                      />
                      <ShiftTimesEdit
                        shift={shift}
                        date={selected}
                        instructorId={u.id}
                      />
                    </>
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
            {staff.length === 0 && (
              <p className="text-sm text-muted">Инструкторов нет.</p>
            )}
          </div>
          </section>

          <section className="mt-5 lg:mt-0">
          <h3 className="text-sm font-bold text-muted">Оплаты за день</h3>
          {payments && payments.lines.length > 0 ? (
            <div className="mt-2 rounded-xl border border-line/70 px-3 py-2">
              {payments.lines.map((l) => (
                <div
                  key={l.method}
                  className="flex items-baseline justify-between gap-3 border-b border-line/50 py-1.5 last:border-0"
                >
                  <p className={`text-sm ${l.unknown ? "text-amber-600" : ""}`}>
                    {l.method}
                    <span className="text-xs text-muted"> · {l.count}</span>
                  </p>
                  <p className="shrink-0 text-sm font-bold tabular-nums">
                    {vnd(l.amount)}
                  </p>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-3 border-t border-line pt-2">
                <p className="text-sm font-semibold">Всего</p>
                <p className="shrink-0 text-base font-bold tabular-nums text-primary">
                  {vnd(payments.total)}
                </p>
              </div>
              {/* Способ оплаты не проставляют, когда заявку закрывают кнопкой
                  «Выполнена» мимо формы записи — тогда деньги в базе есть, а
                  чем заплатили, неизвестно. Пусть это будет видно. */}
              {payments.lines.some((l) => l.unknown) && (
                <p className="mt-2 text-xs text-amber-600">
                  Часть оплат без способа — записи оформили не через форму
                  «Записать клиента».
                </p>
              )}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted">Оплат в этот день не было.</p>
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
          </section>
          </div>
        </DayModal>
      )}
    </div>
  );
}
