import { vnd } from "@/lib/stats";
import { MARINA_RATE } from "@/lib/finance";
import type { DayReport } from "@/lib/dayReport";

// Отчёт за день — то, что инструктор вечером переписывает в журнал Marina Beach
// (пачка №15, п.1). Показывается только на закрытой смене, поэтому и выглядит
// как итог дня, а не как живая сводка.
//
// Порядок блоков повторяет порядок граф в журнале: сначала услуги по типажам,
// потом деньги и в самом конце комиссия площадке. Так его переписывают сверху
// вниз, не прыгая глазами по экрану.

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
        <p className={`text-sm ${strong ? "font-semibold" : "text-muted"}`}>
          {label}
        </p>
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

export function DayReportCard({ report }: { report: DayReport }) {
  const dateLabel = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${report.date}T00:00:00Z`));

  return (
    <section className="rounded-2xl border-2 border-primary/40 bg-primary/5 p-4">
      <h2 className="font-bold">Отчёт за день — для журнала Марины</h2>
      <p className="mt-0.5 text-xs text-muted">
        {dateLabel} · вся школа за день, включая занятия напарника. Переписывайте
        сверху вниз.
      </p>

      {/* Услуги по типажам */}
      <div className="mt-3 rounded-xl bg-surface px-3 py-2">
        {report.counts.length === 0 ? (
          <p className="py-1.5 text-sm text-muted">
            Занятий за день не записано. Если сегодня катались — оформите записи,
            иначе в журнал уйдёт ноль.
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
              <p>Всего услуг</p>
              <p className="font-semibold tabular-nums">{report.servicesTotal}</p>
            </div>
          </>
        )}
      </div>

      {/* Деньги */}
      <div className="mt-3 rounded-xl bg-surface px-3 py-2">
        <Row label="Занятия" value={vnd(report.sessionsRevenue)} />
        {report.subsRevenue > 0 && (
          <Row
            label="Абонементы"
            value={vnd(report.subsRevenue)}
            hint="оплачены сегодня"
          />
        )}
        <div className="border-t border-line/60 pt-1">
          <Row label="Выручка за день" value={vnd(report.revenue)} strong />
        </div>
        <Row
          label="Марине"
          value={vnd(report.marina)}
          hint={`${Math.round(MARINA_RATE * 100)}% с выручки без комиссий агентов`}
          strong
          tone="primary"
        />
        <div className="border-t border-line/60 pt-1">
          <Row
            label="Прибыль до ЗП"
            value={vnd(report.profitBeforePay)}
            hint="выручка минус марина"
            strong
          />
        </div>
      </div>

      {/* ЗП */}
      <div className="mt-3 rounded-xl bg-surface px-3 py-2">
        <Row label="Моя ЗП за день" value={vnd(report.mySalary)} strong tone="primary" />
        <Row
          label="ЗП всей смены"
          value={vnd(report.crewSalary)}
          hint={
            report.crew.length > 0
              ? report.crew.map((m) => `${m.name} ${vnd(m.salary)}`).join(" · ")
              : "смену сегодня никто не открывал"
          }
        />
        <div className="border-t border-line/60 pt-1">
          <Row
            label="Прибыль после ЗП"
            value={vnd(report.profitAfterPay)}
            hint="выручка минус марина и минус ЗП"
            strong
          />
        </div>
      </div>

      {/* Честная сноска: пока напарник не закрылся, его выход не оплачен, и
          обе суммы ЗП вырастут. Без этого цифра выглядела бы ошибкой. */}
      {report.pendingShifts > 0 && (
        <p className="mt-3 text-xs text-amber-600">
          {report.pendingShifts === 1
            ? "Один выход на смене ещё не закрыт"
            : `Выходов не закрыто: ${report.pendingShifts}`}{" "}
          — за них ЗП пока не начислена, суммы подрастут после закрытия.
        </p>
      )}
    </section>
  );
}
