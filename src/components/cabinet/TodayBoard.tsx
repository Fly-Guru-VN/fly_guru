import { Link } from "@/i18n/navigation";
import { vnd } from "@/lib/stats";
import { vnTimeLabel } from "@/lib/dates";
import { MARINA_RATE } from "@/lib/finance";
import { SHIFT_PAY } from "@/lib/salary";
import { CLOSE_DEADLINE_HOUR, OPEN_DEADLINE_HOUR } from "@/lib/shiftRules";
import { CATEGORY_LABELS } from "@/content/services";
import { SUBS_CAT } from "@/lib/payments";
import type { DayReport, MyShiftState } from "@/lib/dayReport";

// Вкладка «Сегодня» — живая сводка текущего дня для инструктора (10.08.2026).
//
// Зачем: инструктор спросил, где посмотреть выручку за сегодня и процент
// Марины. Раньше эти цифры существовали ровно в одном месте — отчёт для журнала
// на вкладке «Смена», и только ПОСЛЕ закрытия смены. То есть днём, когда вопрос
// и возникает, ответа не было нигде.
//
// Порядок блоков — по частоте вопроса: сначала «сколько я заработал», потом
// «сколько денег в кассе и сколько с них Марине», потом чем платили (сводить
// наличку вечером), и только затем — что именно накатали за день.
//
// Отчёт для журнала Марины остался на «Смене» и по-прежнему открывается после
// закрытия: там он собран в порядке граф журнала, чтобы переписывать не думая.

// Подпись строки выхода. Ключевое здесь — «зачтётся»: это единственный рычаг,
// который заставляет закрывать смену, раз сами цифры теперь видны с утра.
const SHIFT_NOTE: Record<MyShiftState, string> = {
  none: `Смена не открыта. Сделайте фото на пляже до ${OPEN_DEADLINE_HOUR}:00 — выход зачтётся.`,
  planned: `Смена в графике, но не открыта. Фото на пляже до ${OPEN_DEADLINE_HOUR}:00 — и выход ваш.`,
  notClosed: `Зачтётся, когда закроете смену после ${CLOSE_DEADLINE_HOUR}:00 — фото у бара на выходе.`,
  paid: "Выход зачтён — смена отработана по регламенту.",
  lateOpen: `Смена открыта после ${OPEN_DEADLINE_HOUR}:00 — за этот выход премии нет.`,
  earlyClose: `Смена закрыта до ${CLOSE_DEADLINE_HOUR}:00 — за этот выход премии нет.`,
  cancelled: "Премию за выход снял админ — причина указана в «Статистике».",
};

// Заработает ли ещё 200 000 ₫ до конца дня. Нужен, чтобы не пугать нулём тех,
// у кого день просто не закончился.
const STILL_POSSIBLE: MyShiftState[] = ["none", "planned", "notClosed"];

function money(n: number): string {
  return vnd(Math.round(n));
}

function Row({
  label,
  value,
  hint,
  strong,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
  tone?: "primary" | "muted";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <p className={`text-sm ${strong ? "font-semibold" : "text-muted"}`}>{label}</p>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      <p
        className={`shrink-0 tabular-nums ${
          strong ? "text-base font-bold" : "text-sm font-semibold"
        } ${tone === "primary" ? "text-primary" : tone === "muted" ? "text-muted" : "text-ink"}`}
      >
        {value}
      </p>
    </div>
  );
}

function Card({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
      <h2 className="font-bold">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      <div className="mt-2">{children}</div>
    </section>
  );
}

// Название вида занятия в кассе. Абонемент — не услуга из справочника, своей
// подписи в CATEGORY_LABELS у него нет.
function catLabel(c: string): string {
  if (c === SUBS_CAT) return "Абонементы";
  return (CATEGORY_LABELS as Record<string, string>)[c] ?? c;
}

// Заявка, подтверждённая админом на сегодня: план дня, который ещё не стал
// занятием. Пришла из bookings — сессия с заявкой в базе не связана, поэтому
// строка висит здесь до тех пор, пока запись не закроют (status → done).
export interface TodayBooking {
  id: string;
  name: string;
  time: string | null;
  service: string | null;
  acceptedBy: string | null;
}

export function TodayBoard({
  report,
  bookings,
}: {
  report: DayReport;
  bookings: TodayBooking[];
}) {
  const { myShift, mySalaryParts: parts, payments } = report;
  const shiftPending = STILL_POSSIBLE.includes(myShift.state);

  return (
    <>
      {/* Моя ЗП — первое, ради чего сюда заходят */}
      <section className="mt-4 rounded-2xl border-2 border-primary bg-surface p-5">
        <p className="text-sm text-muted">Моя ЗП за сегодня</p>
        <p className="mt-1 text-3xl font-bold text-primary">{money(report.mySalary)}</p>

        <div className="mt-3 space-y-1 text-sm text-muted">
          <p>15% с занятий дня — моя доля: {money(parts.sessions)}</p>
          <p>
            Выход: {money(parts.shift)}
            {parts.shift === 0 && shiftPending && (
              <span className="text-ink"> — ещё можно заработать {vnd(SHIFT_PAY)}</span>
            )}
          </p>
          <p>Абонементы — моя доля котла за день: {money(parts.subs)}</p>
        </div>

        {/* Строка выхода: единственное место, где видно, что деньги зависят от
            закрытия смены. Пока не закрыт — подсвечиваем. */}
        <div
          className={`mt-3 rounded-xl px-3 py-2 text-xs ${
            myShift.state === "paid"
              ? "bg-primary/10 text-primary"
              : shiftPending
                ? "bg-amber-50 text-amber-700"
                : "bg-line/40 text-muted"
          }`}
        >
          {SHIFT_NOTE[myShift.state]}
          {myShift.openedAt && (
            <>
              {" "}
              Открыта в {vnTimeLabel(myShift.openedAt)}
              {myShift.closedAt ? `, закрыта в ${vnTimeLabel(myShift.closedAt)}.` : "."}
            </>
          )}{" "}
          <Link href="/instructor/shift" className="font-semibold underline">
            К смене
          </Link>
        </div>

        <p className="mt-2 text-xs text-muted">
          15% с занятий дня делятся поровну между теми, кто сегодня открыл смену —
          неважно, кто оформил запись. Абонементный котёл общий: 15% от проданных
          сегодня абонементов делятся на всех инструкторов.
        </p>
      </section>

      {/* Деньги дня и доля площадки */}
      <Card
        title="Выручка за сегодня"
        hint="вся школа за день, включая занятия напарника"
      >
        <Row label="Занятия" value={money(report.sessionsRevenue)} />
        {report.subsRevenue > 0 && (
          <Row
            label="Абонементы"
            value={money(report.subsRevenue)}
            hint={`оплачено сегодня: ${report.subsPaidCount}`}
          />
        )}
        <div className="border-t border-line/60 pt-1">
          <Row label="Выручка за день" value={money(report.revenue)} strong />
        </div>
        <Row
          label="Марине"
          value={money(report.marina)}
          hint={`${Math.round(MARINA_RATE * 100)}% с выручки без комиссий агентов`}
          strong
          tone="primary"
        />
        <div className="border-t border-line/60 pt-1">
          <Row
            label="Остаётся школе"
            value={money(report.profitBeforePay)}
            hint="выручка минус марина, до ЗП"
            strong
          />
        </div>
      </Card>

      {/* Касса: чем платили. Вечером по этой карточке сводят наличные. */}
      {payments.lines.length > 0 && (
        <Card
          title="Чем платили"
          hint="сверьте наличные в кармане с этой строкой"
        >
          {payments.lines.map((l) => (
            <div key={l.method} className="border-b border-line/40 py-1.5 last:border-0">
              <div className="flex items-baseline justify-between gap-3">
                <p
                  className={`text-sm font-semibold ${l.unknown ? "text-amber-600" : ""}`}
                >
                  {l.method}
                </p>
                <p className="shrink-0 font-bold tabular-nums">{money(l.amount)}</p>
              </div>
              <p className="text-xs text-muted">
                {l.count} опл. ·{" "}
                {[...l.byCategory.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([c, v]) => `${catLabel(c)} ${money(v)}`)
                  .join(" · ")}
              </p>
            </div>
          ))}
          <div className="mt-1 border-t border-line/60 pt-1">
            <Row label="Итого в кассе" value={money(payments.total)} strong tone="primary" />
          </div>
          {payments.lines.some((l) => l.unknown) && (
            <p className="mt-1 text-xs text-amber-600">
              «Не указан» — занятия, у которых не проставили способ оплаты. Поправьте
              их в «Сессиях», иначе касса не сойдётся.
            </p>
          )}
        </Card>
      )}

      {/* Что накатали — те же типажи, что в журнале Марины */}
      <Card title="Занятия за день">
        {report.counts.length === 0 ? (
          <p className="py-1 text-sm text-muted">
            Записей пока нет. Если уже катались — оформите занятие, иначе оно не
            попадёт ни в кассу, ни в ЗП.
          </p>
        ) : (
          <>
            {report.counts.map((c) => (
              <div
                key={c.key}
                className="flex items-baseline justify-between gap-3 border-b border-line/50 py-1.5 last:border-0"
              >
                <p className="text-sm">{c.label}</p>
                <p className="shrink-0 text-lg font-bold tabular-nums text-primary">
                  {c.count}
                </p>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-3 pt-2 text-xs text-muted">
              <p>Всего услуг{report.minutesWrittenOff > 0 ? " · списано минут" : ""}</p>
              <p className="font-semibold tabular-nums">
                {report.servicesTotal}
                {report.minutesWrittenOff > 0 ? ` · ${report.minutesWrittenOff} мин` : ""}
              </p>
            </div>
          </>
        )}
      </Card>

      {/* План на остаток дня: заявки на сегодня, которые ещё открыты */}
      {bookings.length > 0 && (
        <Card
          title={`Записи на сегодня — ${bookings.length}`}
          hint="подтверждённые заявки, которые ещё не закрыты"
        >
          {bookings.map((b) => (
            <div
              key={b.id}
              className="flex items-baseline justify-between gap-3 border-b border-line/50 py-1.5 last:border-0"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{b.name}</p>
                <p className="truncate text-xs text-muted">
                  {[b.service, b.acceptedBy && `принял ${b.acceptedBy}`]
                    .filter(Boolean)
                    .join(" · ") || "услуга не указана"}
                </p>
              </div>
              <p className="shrink-0 text-sm font-semibold tabular-nums">
                {b.time ?? "—"}
              </p>
            </div>
          ))}
          <Link
            href="/instructor/bookings"
            className="mt-2 inline-block text-sm font-semibold text-primary underline"
          >
            Открыть записи
          </Link>
        </Card>
      )}

      {/* Кто сегодня на смене и сколько кому идёт за день */}
      <Card
        title="Смена сегодня"
        hint="на смене те, кто её открыл: фото на пляже"
      >
        {report.crew.length === 0 ? (
          <p className="py-1 text-sm text-muted">
            Смену сегодня ещё никто не открыл.
          </p>
        ) : (
          <>
            {report.crew.map((m) => (
              <Row
                key={m.id}
                label={m.name}
                value={money(m.salary)}
                hint={m.shiftOpen ? "смена не закрыта — сумма подрастёт" : undefined}
              />
            ))}
            <div className="border-t border-line/60 pt-1">
              <Row label="ЗП всей смены" value={money(report.crewSalary)} strong />
            </div>
          </>
        )}
      </Card>
    </>
  );
}
