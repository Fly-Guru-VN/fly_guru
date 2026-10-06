import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dayShort, vnMonth, vnShiftDays, vnToday } from "@/lib/dates";
import { vnd } from "@/lib/stats";
import { getInstructorCard, PAYROLL_EPOCH } from "@/lib/payroll";
import { isUnderpaid, type PayWeek, type PayWeekStatus } from "@/lib/payrollWeeks";
import { SHIFT_PAY } from "@/lib/salary";
import { PageHeader } from "@/components/cabinet/PageHeader";
import { MonthSwitcher, resolveYm } from "../../MonthSwitcher";
import { PayoutForm } from "../PayoutForm";
import { PayButton } from "../PayButton";
import { HistoryRow } from "../HistoryRow";
import { CHIP, DetailLine, StatLabel } from "../parts";

export const metadata: Metadata = { title: "Админка · Карточка инструктора" };

// Карточка инструктора (просьба David от 01.10.2026). Открывается из «Выплаты
// зарплаты» вместо раскрывашки «Как посчитали».
//
// Вопрос, ради которого она есть: «почему осталось выдать 4 325 000, если за
// неделю он заработал 612 500 — это ошибка начальника или системы?». Ответ
// всегда лежит в неделях: какая-то неделя без внесённой выплаты, или выдали
// больше, или идёт текущая. Поэтому наверху — из чего сложился остаток, ниже —
// недели выбранного месяца с выплатами за каждую и кнопкой «Выплатить» у той,
// где не хватает. Как выплата привязывается к неделе — см. lib/payrollWeeks.

const EPOCH_YM = PAYROLL_EPOCH.slice(0, 7);

// «12–18 сент.» или «29 авг. – 4 сент.» — неделя на стыке месяцев.
function weekLabel(w: Pick<PayWeek, "fromDay" | "lastDay">): string {
  if (w.fromDay.slice(0, 7) === w.lastDay.slice(0, 7)) {
    return `${Number(w.fromDay.slice(8))}–${dayShort(w.lastDay)}`;
  }
  return `${dayShort(w.fromDay)} – ${dayShort(w.lastDay)}`;
}

const STATUS: Record<PayWeekStatus, { label: string; className: string }> = {
  running: { label: "идёт неделя", className: "bg-line/50 text-muted" },
  empty: { label: "не работал", className: "bg-line/50 text-muted" },
  paid: { label: "✓ выдано", className: "bg-emerald-100 text-emerald-800" },
  missing: { label: "выплата не внесена", className: "bg-red-100 text-red-700" },
  short: { label: "выдано меньше", className: "bg-amber-100 text-amber-800" },
  over: { label: "выдано больше", className: "bg-sky-100 text-sky-800" },
};

function Tile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-bg/70 p-3">
      <StatLabel>{label}</StatLabel>
      <p className="mt-0.5 text-lg font-bold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

function WeekRow({ w, payee }: { w: PayWeek; payee: string }) {
  const status = STATUS[w.status];
  const label = weekLabel(w);
  return (
    <div
      id={`w-${w.fromDay}`}
      className={`scroll-mt-24 rounded-2xl border p-3 sm:p-4 ${
        isUnderpaid(w) ? "border-red-300 bg-red-50/40" : "border-line bg-bg/70"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-bold">{label}</p>
          <span className={`${CHIP} ${status.className}`}>{status.label}</span>
        </div>
        <p className="text-right">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            заработал{" "}
          </span>
          <span className="font-bold tabular-nums">{vnd(w.earned)}</span>
        </p>
      </div>

      <div className="mt-2 text-sm">
        {w.payouts.length > 0 ? (
          w.payouts.map((p) => (
            <p key={p.id} className="flex flex-wrap justify-between gap-x-3">
              <span className="text-muted">
                выдано {dayShort(p.paidOn)}
                {p.comment ? ` · ${p.comment}` : ""}
              </span>
              <span className="font-semibold tabular-nums">{vnd(p.amount)}</span>
            </p>
          ))
        ) : (
          w.status !== "empty" && (
            <p className="text-muted">
              {w.status === "running"
                ? `выплата — в субботу, ${dayShort(vnShiftDays(w.lastDay, 1))}`
                : "выплат за эту неделю нет"}
            </p>
          )
        )}
      </div>

      {isUnderpaid(w) && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-red-700">
            не хватает {vnd(w.diff)}
          </p>
          <PayButton payee={payee} amount={w.diff} comment={`за ${label}`} />
        </div>
      )}
      {w.status === "over" && (
        <p className="mt-2 text-sm text-muted">
          выдано на {vnd(-w.diff)} больше заработанного — аванс или две недели
          одной выплатой
        </p>
      )}
    </div>
  );
}

export default async function InstructorCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ m?: string }>;
}) {
  const [{ id }, { m }] = await Promise.all([params, searchParams]);
  const ym = resolveYm(m, EPOCH_YM);

  const supabase = await createClient();
  const card = await getInstructorCard(supabase, id, ym);
  if (!card) notFound();

  const { member, weeks, stats, month } = card;
  const payee = `staff:${member.id}`;
  const basePath = `/admin/payroll/${member.id}`;
  const epochLabel = dayShort(PAYROLL_EPOCH);

  // Из чего сложился остаток: идущая неделя + недовыданное − выданное сверху.
  // Сумма трёх частей и есть «осталось выдать» (см. lib/payrollWeeks).
  const running = weeks.find((w) => w.status === "running");
  const holes = weeks.filter(isUnderpaid);
  const holesSum = holes.reduce((s, w) => s + w.diff, 0);
  const overSum = weeks
    .filter((w) => w.status === "over")
    .reduce((s, w) => s + w.diff, 0);
  const left = Math.round(card.left);

  // Недели выбранного месяца: все, что его задевают, свежие сверху.
  const monthFull = vnMonth(ym);
  const monthLastDay = vnShiftDays(monthFull.toDay, -1);
  const monthWeeks = weeks
    .filter((w) => w.lastDay >= monthFull.fromDay && w.fromDay <= monthLastDay)
    .reverse();

  const today = vnToday();

  return (
    <div>
      <Link
        href="/admin/payroll"
        className="inline-flex items-center gap-1 text-sm font-semibold text-muted transition-colors hover:text-primary"
      >
        ← Выплата зарплаты
      </Link>

      <div className="mt-2">
        <PageHeader
          title={member.name}
          hint={[
            member.senior ? "старший инструктор" : "инструктор",
            card.employmentLabel,
          ]
            .filter(Boolean)
            .join(" · ")}
        />
      </div>

      {/* 1. Осталось выдать — и сразу из чего оно сложилось. */}
      <section className="mt-4 rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Осталось выдать</h2>
            <p className="text-sm text-muted">с {epochLabel} по сегодня</p>
          </div>
          {left === 0 ? (
            <span className={`${CHIP} bg-emerald-100 text-emerald-800`}>
              ✓ Всё выдано
            </span>
          ) : left < 0 ? (
            <span className={`${CHIP} bg-amber-100 text-amber-800`}>
              Переплата {vnd(-left)}
            </span>
          ) : (
            <p className="text-3xl font-bold tabular-nums text-primary">
              {vnd(left)}
            </p>
          )}
        </div>

        <div className="mt-3 rounded-xl border border-line bg-bg/70 p-3 text-sm">
          <StatLabel>из чего сложилось</StatLabel>
          <div className="mt-1">
            {running && Math.round(running.diff) !== 0 && (
              <DetailLine
                label={`Идущая неделя, ${weekLabel(running)}`}
                hint="выплата в субботу"
                value={running.diff}
              />
            )}
            {holes.length > 0 && (
              <DetailLine label="Недели, где не хватает выплаты" value={holesSum} />
            )}
            {holes.map((w) => (
              <div
                key={w.fromDay}
                className="flex items-baseline justify-between gap-3 py-1 pl-3"
              >
                <Link
                  href={`${basePath}?m=${w.lastDay.slice(0, 7)}#w-${w.fromDay}`}
                  className="font-semibold text-red-700 underline decoration-dotted underline-offset-2"
                >
                  {weekLabel(w)}
                </Link>
                <span className="tabular-nums text-red-700">{vnd(w.diff)}</span>
              </div>
            ))}
            {overSum < 0 && (
              <DetailLine
                label="Выдано больше заработанного"
                value={-overSum}
                negative
              />
            )}
            <DetailLine
              label={left < 0 ? "Выдано лишнего" : "Осталось выдать"}
              value={Math.abs(card.left)}
              strong
            />
          </div>
          {holes.length > 0 && (
            <p className="mt-2 text-muted">
              Если за эти недели деньги уже отдавали, внесите выплату с настоящей
              датой выдачи — неделя станет зелёной, а остаток уменьшится.
            </p>
          )}
        </div>
      </section>

      {/* 2. Месяц: сводка и недели. */}
      <MonthSwitcher ym={ym} basePath={basePath} minYm={EPOCH_YM} />

      <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
        {/* Название месяца уже стоит в переключателе сверху — здесь не повторяем. */}
        <h2 className="text-lg font-bold">Сводка за месяц</h2>
        <p className="text-sm text-muted">
          {dayShort(month.fromDay)} — {dayShort(month.lastDay)}
          {month.lastDay === today && month.fromDay <= today ? " (по сегодня)" : ""}
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label="Занятий" value={String(stats.sessionsCount)} />
          <Tile label="Клиентов" value={String(stats.clientsCount)} />
          <Tile
            label="Выходов"
            value={String(stats.shiftsCount)}
            sub={
              stats.shiftsUnpaidCount > 0
                ? `не зачтено: ${stats.shiftsUnpaidCount}`
                : undefined
            }
          />
          <Tile label="Выручка с его занятий" value={vnd(stats.revenue)} />
        </div>

        <div className="mt-3 rounded-xl border border-line bg-bg/70 p-3 text-sm">
          <StatLabel>заработал за месяц</StatLabel>
          <div className="mt-1">
            <DetailLine
              label="Доля 15% с занятий дня"
              value={stats.salaryFromSessions}
            />
            <DetailLine
              label={`Выходы · ${stats.shiftsCount} × ${vnd(SHIFT_PAY)}`}
              value={stats.salaryFromShifts}
            />
            <DetailLine
              label="Доля котла абонементов"
              hint={
                stats.sharedSubsCount > 0
                  ? `с ${stats.sharedSubsCount} абон.`
                  : undefined
              }
              value={stats.salaryFromSubs}
            />
            {stats.toursCount > 0 && (
              <DetailLine
                label={`Экскурсии и сафари · выездов ${stats.toursCount}`}
                value={stats.salaryFromTours}
              />
            )}
            <DetailLine label="Итого" value={stats.salary} strong />
          </div>
        </div>
      </section>

      <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
        <h2 className="text-lg font-bold">Выплаты по неделям</h2>
        <p className="text-sm text-muted">
          Неделя — с субботы по пятницу, платят в субботу за прошедшие 7 дней.
          Выплата относится к последней неделе, закончившейся к дню выдачи.
        </p>
        <div className="mt-3 space-y-2">
          {monthWeeks.map((w) => (
            <WeekRow key={w.fromDay} w={w} payee={payee} />
          ))}
          {monthWeeks.length === 0 && (
            <p className="text-sm text-muted">В этом месяце недель нет.</p>
          )}
        </div>
      </section>

      {/* 3. Выплатить — сюда подматывает кнопка недели. */}
      <section className="mt-3 rounded-2xl border border-primary/30 bg-surface p-4">
        <h2 className="text-lg font-bold">Выплатить</h2>
        <PayoutForm
          payees={[
            {
              kind: "staff",
              id: member.id,
              name: member.name,
              group: "Инструкторы",
              suggested: Math.max(0, left),
              fired: card.fired,
            },
          ]}
          initialPayee={payee}
          today={today}
        />
      </section>

      {/* 4. Все выплаты человеку с точки отсчёта. */}
      <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-bold">История выплат с {epochLabel}</h2>
        {card.payouts.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Выплат пока не было.</p>
        ) : (
          <div className="mt-2">
            {card.payouts.map((p) => (
              <HistoryRow key={p.id} p={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
