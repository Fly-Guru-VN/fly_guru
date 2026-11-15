import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dayShort, vnCurrentMonth, vnMonth, vnPeriod, vnShiftDays, vnToday } from "@/lib/dates";
import { vnd } from "@/lib/stats";
import {
  getInstructorCard,
  getMonthlyPayroll,
  getPayoutHistory,
  PAYROLL_EPOCH,
  type DueRow,
  type InstructorCard,
  type PayoutRow,
} from "@/lib/payroll";
import {
  buildPayDays,
  isUnderpaid,
  type PayDay,
  type PayWeek,
  type PayWeekStatus,
} from "@/lib/payrollWeeks";
import { SHIFT_PAY, SHIFT_PAY_LABEL } from "@/lib/salary";
import { employmentLabel, isFired, loadMechanics, loadSmm, type StaffMember } from "@/lib/staff";
import { getProfileStats, tenureLabel, tenureUntil, type ProfileStats } from "@/lib/staffProfile";
import { StaffAvatar } from "@/components/cabinet/StaffAvatar";
import { Hint } from "@/components/cabinet/Hint";
import { MonthSwitcher, resolveYm } from "../../MonthSwitcher";
import { PayoutForm } from "../PayoutForm";
import { MonthlyChip, PayButton } from "../PayButton";
import { HistoryRow } from "../HistoryRow";
import { AvatarUpload } from "../AvatarUpload";
import { CHIP, DetailLine, StatLabel } from "../parts";

export const metadata: Metadata = { title: "Админка · Профиль сотрудника" };

// Профиль сотрудника (15.11.2026, проект передаётся начальнику). Открывается
// по нажатию на плашку во «Выплате зарплаты». Задача экрана: у начальника не
// должно остаться вопросов вида «а как сегодня посчитали зарплату».
//
// Сверху вниз: кто это (фото, стаж) → сколько выдать сейчас → цифры с 1 авг.
// → как посчитана эта неделя, по дням → все недели с выплатами → форма →
// история. Пояснения спрятаны в «?» (компонент Hint), на экране только
// подписанные цифры.
//
// Подробный разбор по дням есть только у инструкторов (решение David): у
// СММщика и механика зарплата — фикс по субботам и оклад, там раскладывать
// нечего, им достаточно «откуда к выплате».

const EPOCH_YM = PAYROLL_EPOCH.slice(0, 7);
const EPOCH_LABEL = dayShort(PAYROLL_EPOCH);

// «12–18 сент.» или «29 авг. – 4 сент.» — неделя на стыке месяцев.
function weekLabel(w: Pick<PayWeek, "fromDay" | "lastDay">): string {
  if (w.fromDay.slice(0, 7) === w.lastDay.slice(0, 7)) {
    return `${Number(w.fromDay.slice(8))}–${dayShort(w.lastDay)}`;
  }
  return `${dayShort(w.fromDay)} – ${dayShort(w.lastDay)}`;
}

// «сб, 15 нояб.»
function dayTitle(day: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}

const STATUS: Record<PayWeekStatus, { label: string; className: string }> = {
  running: { label: "идёт неделя", className: "bg-line/50 text-muted" },
  empty: { label: "не работал", className: "bg-line/50 text-muted" },
  paid: { label: "✓ выдано", className: "bg-emerald-100 text-emerald-800" },
  missing: { label: "не выдано", className: "bg-red-100 text-red-700" },
  short: { label: "выдано меньше", className: "bg-amber-100 text-amber-800" },
  over: { label: "выдано больше", className: "bg-sky-100 text-sky-800" },
};

// ── Подсказки «?» ────────────────────────────────────────────────────────────

function HintDue() {
  return (
    <Hint title="К выплате">
      <p>
        Сколько нужно выдать прямо сейчас: всё заработанное с {EPOCH_LABEL}{" "}
        минус всё, что уже выдали.
      </p>
      <p>
        Заработок идущей недели сюда не входит: неделя идёт с субботы по
        пятницу, а платят за неё в следующую субботу.
      </p>
    </Hint>
  );
}

function HintSessions() {
  return (
    <Hint title="15% с занятий">
      <p>
        С каждого занятия дня 15% идут инструкторам. Если в этот день смену
        открыли двое, эти 15% делятся поровну на двоих, кто бы ни провёл
        занятие. Если смен не было, каждый получает 15% со своих занятий.
      </p>
      <p>Комиссия агента сначала вычитается из чека.</p>
    </Hint>
  );
}

function HintShift() {
  return (
    <Hint title="Выход">
      <p>
        {vnd(SHIFT_PAY)} за смену по регламенту: открыл до 9:00 и закрыл после
        18:00. Опоздал, рано закрыл или не закрыл смену — за выход не платят.
        Ещё премию может снять админ.
      </p>
    </Hint>
  );
}

function HintSubs() {
  return (
    <Hint title="Котёл абонементов">
      <p>
        С каждого проданного абонемента 15% идут в общий котёл. Его делят
        поровну все инструкторы, которые в день оплаты абонемента были в
        штате. Неважно, кто именно продал.
      </p>
    </Hint>
  );
}

// ── Кусочки экрана ──────────────────────────────────────────────────────────

function Tile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-bg/70 p-3">
      <div className="flex items-center gap-1.5">
        <StatLabel>{label}</StatLabel>
        {hint}
      </div>
      <p className="mt-0.5 text-lg font-bold tabular-nums sm:text-xl">{value}</p>
    </div>
  );
}

function ProfileHeader({
  member,
  role,
  stats,
}: {
  member: StaffMember;
  role: string;
  stats: ProfileStats | null;
}) {
  const fired = isFired(member);
  const status = employmentLabel(member);
  const tenure = stats?.since
    ? `в команде ${tenureLabel(stats.since, tenureUntil(member))} · с ${dayShort(stats.since)}`
    : null;
  return (
    <section className="mt-2 flex items-center gap-4 rounded-2xl border border-line bg-surface p-4">
      <StaffAvatar name={member.name} photoUrl={member.photoUrl} size="lg" dim={fired} />
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-bold sm:text-2xl">{member.name}</h1>
        <p className="text-sm text-muted">
          {role}
          {fired && status ? ` · ${status}` : ""}
        </p>
        {tenure && <p className="text-sm text-muted">{tenure}</p>}
        <div className="mt-2">
          <AvatarUpload id={member.id} hasPhoto={Boolean(member.photoUrl)} />
        </div>
      </div>
    </section>
  );
}

function BackLink() {
  return (
    <Link
      href="/admin/payroll"
      className="inline-flex items-center gap-1 text-sm font-semibold text-muted transition-colors hover:text-primary"
    >
      ← Выплата зарплаты
    </Link>
  );
}

function DueAmount({ value }: { value: number }) {
  const v = Math.round(value);
  if (v > 0) {
    return <p className="text-3xl font-bold tabular-nums text-primary">{vnd(v)}</p>;
  }
  if (v < 0) {
    return (
      <span className={`${CHIP} bg-amber-100 text-amber-800`}>Переплата {vnd(-v)}</span>
    );
  }
  return <span className={`${CHIP} bg-emerald-100 text-emerald-800`}>✓ Всё выдано</span>;
}

// Один день: итог и из чего он сложился.
function DayCard({ d }: { d: PayDay }) {
  const sessionNote =
    d.sessionBase !== null
      ? `выручка дня ${vnd(d.sessionBase)}${
          (d.sessionCrew ?? 1) > 1 ? `, поделено на ${d.sessionCrew}` : ""
        }`
      : null;
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-semibold first-letter:uppercase">{dayTitle(d.day)}</p>
        <p className="font-bold tabular-nums">{vnd(d.total)}</p>
      </div>
      <div className="mt-1 text-sm">
        {(Math.round(d.sessions) !== 0 || sessionNote) && (
          <div className="flex items-baseline justify-between gap-3 py-0.5 text-muted">
            <span className="min-w-0">
              15% с занятий
              {sessionNote && <span className="block text-xs">{sessionNote}</span>}
            </span>
            <span className="shrink-0 tabular-nums">{vnd(d.sessions)}</span>
          </div>
        )}
        {d.shiftStatus && (
          <div className="flex items-baseline justify-between gap-3 py-0.5 text-muted">
            <span className="min-w-0">
              {d.shiftStatus === "paid" ? (
                "Выход"
              ) : (
                <>
                  Выход не оплачен
                  <span className="block text-xs text-red-700">
                    {SHIFT_PAY_LABEL[d.shiftStatus]}
                  </span>
                </>
              )}
            </span>
            <span className="shrink-0 tabular-nums">{vnd(d.shift)}</span>
          </div>
        )}
        {Math.round(d.subs) !== 0 && (
          <div className="flex items-baseline justify-between gap-3 py-0.5 text-muted">
            <span>Котёл абонементов</span>
            <span className="shrink-0 tabular-nums">{vnd(d.subs)}</span>
          </div>
        )}
        {Math.round(d.tours) !== 0 && (
          <div className="flex items-baseline justify-between gap-3 py-0.5 text-muted">
            <span>Экскурсии и сафари</span>
            <span className="shrink-0 tabular-nums">{vnd(d.tours)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function DaysList({ days }: { days: PayDay[] }) {
  if (days.length === 0) {
    return <p className="text-sm text-muted">Рабочих дней пока нет.</p>;
  }
  return (
    <div className="space-y-2">
      {days.map((d) => (
        <DayCard key={d.day} d={d} />
      ))}
    </div>
  );
}

function WeekRow({
  w,
  days,
  payee,
}: {
  w: PayWeek;
  days: PayDay[];
  payee: string;
}) {
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
        <p className="font-bold tabular-nums">{vnd(w.earned)}</p>
      </div>

      {w.payouts.length > 0 && (
        <div className="mt-1 text-sm">
          {w.payouts.map((p) => (
            <p key={p.id} className="flex flex-wrap justify-between gap-x-3 text-muted">
              <span>
                выдано {dayShort(p.paidOn)}
                {p.comment ? ` · ${p.comment}` : ""}
              </span>
              <span className="font-semibold tabular-nums text-ink">{vnd(p.amount)}</span>
            </p>
          ))}
        </div>
      )}

      {days.length > 0 && (
        <details className="group mt-2 text-sm">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 font-semibold text-primary [&::-webkit-details-marker]:hidden">
            По дням
            <span className="transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="mt-2">
            <DaysList days={days} />
          </div>
        </details>
      )}

      {isUnderpaid(w) && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-red-700">не хватает {vnd(w.diff)}</p>
          <PayButton payee={payee} amount={w.diff} comment={`за ${label}`} />
        </div>
      )}
    </div>
  );
}

function PayoutSection({
  member,
  group,
  suggested,
}: {
  member: StaffMember;
  group: string;
  suggested: number;
}) {
  return (
    <section className="mt-3 rounded-2xl border border-primary/30 bg-surface p-4">
      <h2 className="text-lg font-bold">Выплатить</h2>
      <PayoutForm
        payees={[
          {
            kind: "staff",
            id: member.id,
            name: member.name,
            group,
            suggested: Math.max(0, Math.round(suggested)),
            fired: isFired(member),
          },
        ]}
        initialPayee={`staff:${member.id}`}
        today={vnToday()}
      />
    </section>
  );
}

function HistorySection({ payouts }: { payouts: PayoutRow[] }) {
  return (
    <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
      <h2 className="font-bold">История выплат</h2>
      {payouts.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Выплат пока не было.</p>
      ) : (
        <div className="mt-2">
          {payouts.map((p) => (
            <HistoryRow key={p.id} p={p} />
          ))}
        </div>
      )}
    </section>
  );
}

// ── Инструктор: полный профиль ──────────────────────────────────────────────

function InstructorProfile({
  card,
  ym,
  stats,
}: {
  card: InstructorCard;
  ym: string;
  stats: ProfileStats;
}) {
  const { member, weeks } = card;
  const payee = `staff:${member.id}`;
  const basePath = `/admin/payroll/${member.id}`;
  const today = vnToday();

  const daysOf = (w: PayWeek) =>
    buildPayDays({
      fromDay: w.fromDay,
      lastDay: w.lastDay,
      today,
      partsByDay: card.partsByDay,
      sessionDays: card.sessionDays,
      shiftRows: card.shiftRows,
    });

  const running = weeks.find((w) => w.status === "running") ?? null;
  const due = card.left - (running?.diff ?? 0);
  const holes = weeks.filter(isUnderpaid);
  const overSum = -weeks.filter((w) => w.status === "over").reduce((s, w) => s + w.diff, 0);

  const monthFull = vnMonth(ym);
  const monthLastDay = vnShiftDays(monthFull.toDay, -1);
  const monthWeeks = weeks
    .filter((w) => w.lastDay >= monthFull.fromDay && w.fromDay <= monthLastDay)
    .reverse();

  const role = [
    member.senior ? "старший инструктор" : "инструктор",
    member.noSubsShareFrom && `без доли котла с ${dayShort(member.noSubsShareFrom)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div>
      <BackLink />
      <ProfileHeader member={member} role={role} stats={stats} />

      {/* 1. Сколько выдать сейчас. */}
      <section className="mt-3 rounded-2xl border border-primary/30 bg-surface p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            К выплате
            <HintDue />
          </h2>
          <DueAmount value={due} />
        </div>

        {holes.length > 0 && (
          <div className="mt-3 text-sm">
            <StatLabel>не выдано за недели</StatLabel>
            {holes.map((w) => (
              <div key={w.fromDay} className="flex items-baseline justify-between gap-3 py-1">
                <Link
                  href={`${basePath}?m=${w.lastDay.slice(0, 7)}#w-${w.fromDay}`}
                  className="font-semibold text-red-700 underline decoration-dotted underline-offset-2"
                >
                  {weekLabel(w)}
                </Link>
                <span className="tabular-nums text-red-700">{vnd(w.diff)}</span>
              </div>
            ))}
            {Math.round(overSum) > 0 && (
              <DetailLine label="Выдано больше заработанного" value={overSum} negative />
            )}
          </div>
        )}

        {Math.round(due) > 0 && (
          <div className="mt-3">
            <PayButton
              payee={payee}
              amount={due}
              comment={holes.length === 1 ? `за ${weekLabel(holes[0])}` : undefined}
            />
          </div>
        )}

        {running && (
          <p className="mt-3 border-t border-line pt-3 text-sm text-muted">
            Эта неделя ({weekLabel(running)}):{" "}
            <span className="font-bold tabular-nums text-ink">{vnd(running.earned)}</span>
            {" · "}выплата в субботу, {dayShort(vnShiftDays(running.lastDay, 1))}
          </p>
        )}
      </section>

      {/* 2. Цифры с точки отсчёта. */}
      <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-bold">С {EPOCH_LABEL}</h2>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label="Занятий" value={String(stats.sessions)} />
          <Tile label="Смен" value={String(stats.shifts)} />
          <Tile
            label="Часов"
            value={`${Math.round(stats.hours)} ч`}
            hint={
              <Hint title="Часов на сменах">
                <p>
                  Сумма времени от открытия до закрытия смены. Смены, которые
                  не закрыли, не считаются.
                </p>
              </Hint>
            }
          />
          <Tile label="Заработал" value={vnd(card.accruedToDate)} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Tile label="Выдано" value={vnd(card.paidToDate)} />
          <Tile
            label="Осталось"
            value={vnd(Math.max(0, card.left))}
            hint={
              <Hint title="Осталось">
                <p>
                  Заработал минус выдано. В отличие от «К выплате», сюда входит
                  и идущая неделя.
                </p>
              </Hint>
            }
          />
        </div>
      </section>

      {/* 3. Как посчитана эта неделя: по дням. */}
      {running && (
        <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
          <h2 className="text-lg font-bold">Как посчитана эта неделя</h2>
          <p className="text-sm text-muted">{weekLabel(running)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5">
              15% с занятий <HintSessions />
            </span>
            <span className="inline-flex items-center gap-1.5">
              Выход <HintShift />
            </span>
            <span className="inline-flex items-center gap-1.5">
              Котёл <HintSubs />
            </span>
          </div>
          <div className="mt-3">
            <DaysList days={daysOf(running)} />
          </div>
        </section>
      )}

      {/* 4. Все недели по месяцам. */}
      <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          Недели и выплаты
          <Hint title="Недели">
            <p>
              Неделя идёт с субботы по пятницу, платят в субботу за прошедшие 7
              дней. Выплата относится к последней неделе, которая закончилась к
              дню выдачи.
            </p>
            <p>
              Красная неделя: заработал, а выплата не внесена. Если деньги уже
              отдавали, внесите выплату с настоящей датой выдачи.
            </p>
          </Hint>
        </h2>
        <MonthSwitcher ym={ym} basePath={basePath} minYm={EPOCH_YM} />
        <div className="mt-3 space-y-2">
          {monthWeeks.map((w) => (
            <WeekRow key={w.fromDay} w={w} days={daysOf(w)} payee={payee} />
          ))}
          {monthWeeks.length === 0 && (
            <p className="text-sm text-muted">В этом месяце недель нет.</p>
          )}
        </div>
      </section>

      <PayoutSection member={member} group="Инструкторы" suggested={due} />
      <HistorySection payouts={card.payouts} />
    </div>
  );
}

// ── СММщик, механик и прочий штат: короткий профиль ─────────────────────────

const OTHER_ROLE: Record<string, string> = {
  smm: "СММ",
  mechanic: "механик",
};

function HowPaid({ row }: { row: DueRow }) {
  if (row.kind === "smm") {
    return (
      <Hint title="Как считается зарплата СММ">
        <p>Фикс за каждую неделю: начисляется по субботам.</p>
        <p>
          Плюс 1% с выручки школы за месяц: его выдают в конце месяца, до этого
          в «К выплате» он не входит.
        </p>
        <p>
          Если вышел на смену на пляж, за этот день получает как инструктор:
          15% с занятий, выход и котёл абонементов.
        </p>
      </Hint>
    );
  }
  if (row.kind === "mechanic" && row.left !== null) {
    return (
      <Hint title="Как считается зарплата механика">
        <p>
          Оклад за месяц. Оклад текущего месяца уже показан в «К выплате»,
          чтобы его можно было выдать одной кнопкой.
        </p>
      </Hint>
    );
  }
  return null;
}

function OtherProfile({
  member,
  row,
  stats,
  payouts,
  monthLabel,
}: {
  member: StaffMember;
  row: DueRow;
  stats: ProfileStats | null;
  payouts: PayoutRow[];
  monthLabel: string;
}) {
  const payee = `staff:${member.id}`;
  const role = OTHER_ROLE[member.role] ?? "штат";
  return (
    <div>
      <BackLink />
      <ProfileHeader member={member} role={role} stats={stats} />

      <section className="mt-3 rounded-2xl border border-primary/30 bg-surface p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            {row.due === null ? "Выдано всего" : "К выплате"}
            {row.due !== null && <HintDue />}
          </h2>
          {row.due === null ? (
            <p className="text-3xl font-bold tabular-nums text-muted">{vnd(row.paidToDate)}</p>
          ) : (
            <DueAmount value={row.due} />
          )}
        </div>
        {row.upcoming && (row.due ?? 0) > 0 && (
          <p className="mt-1 text-sm text-muted">из них оклад за {row.upcoming.label}</p>
        )}
        {row.due !== null && Math.round(row.due) > 0 && (
          <div className="mt-3">
            <PayButton payee={payee} amount={row.due} />
          </div>
        )}
        {row.monthly && (
          <div className="mt-3 border-t border-line pt-3">
            <MonthlyChip payee={payee} amount={row.monthly.amount} label={row.monthly.label} />
          </div>
        )}
      </section>

      {stats && (
        <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
          <h2 className="font-bold">С {EPOCH_LABEL}</h2>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label="Смен" value={String(stats.shifts)} />
            <Tile label="Часов" value={`${Math.round(stats.hours)} ч`} />
            <Tile label="Заработал" value={vnd(row.accruedToDate)} />
            <Tile label="Выдано" value={vnd(row.paidToDate)} />
          </div>
        </section>
      )}

      {/* Одни нули (уволен до этого месяца) не показываем: это шум. */}
      {row.details.some((d) => Math.round(d.value) !== 0) && (
        <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            Как посчитано за {monthLabel}
            <HowPaid row={row} />
          </h2>
          <div className="mt-2 text-sm">
            {row.details.map((d) => (
              <DetailLine key={d.label} label={d.label} hint={d.hint} value={d.value} />
            ))}
            <DetailLine label="Начислено" value={row.accrued} strong />
          </div>
        </section>
      )}

      <PayoutSection
        member={member}
        group={role === "СММ" ? "СММ" : "Штат"}
        suggested={row.due ?? 0}
      />
      <HistorySection payouts={payouts} />
    </div>
  );
}

// ── Страница ────────────────────────────────────────────────────────────────

export default async function StaffProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ m?: string }>;
}) {
  const [{ id }, { m }] = await Promise.all([params, searchParams]);
  const supabase = await createClient();

  // Инструктор — полный профиль с разбором по дням.
  const ym = resolveYm(m, EPOCH_YM);
  const card = await getInstructorCard(supabase, id, ym);
  if (card) {
    const stats = await getProfileStats(supabase, card.member, PAYROLL_EPOCH);
    return <InstructorProfile card={card} ym={ym} stats={stats} />;
  }

  // Остальные: строка «Выплаты зарплаты» за текущий месяц (по сегодня) — из
  // неё «к выплате» и раскладка начисления. Разработчика там нет (15.11.2026),
  // поэтому и профиля у него нет.
  const month = vnCurrentMonth();
  const today = vnToday();
  const [payroll, history, smm, mechanics] = await Promise.all([
    getMonthlyPayroll(supabase, vnPeriod(month.fromDay, today)),
    getPayoutHistory(supabase),
    loadSmm(supabase),
    loadMechanics(supabase),
  ]);
  const row = payroll.rows.find((r) => r.payee?.kind === "staff" && r.payee.id === id);
  if (!row) notFound();

  const known = [...smm, ...mechanics].find((u) => u.id === id);
  // Прочий штат (например, админ, которому выдавали деньги): ставки и смен в
  // расчёте у него нет, показываем имя и выплаты.
  const member: StaffMember = known ?? {
    id,
    name: row.name,
    role: "admin",
    hiredAt: null,
    leftAt: null,
    senior: false,
    photoUrl: row.photoUrl,
  };
  const stats = known ? await getProfileStats(supabase, known, PAYROLL_EPOCH) : null;
  const payouts = history.filter(
    (p) => p.kind === "staff" && p.payeeId === id && p.paidOn >= PAYROLL_EPOCH,
  );

  return (
    <OtherProfile
      member={member}
      row={row}
      stats={stats}
      payouts={payouts}
      monthLabel={new Intl.DateTimeFormat("ru-RU", { month: "long", timeZone: "UTC" }).format(
        new Date(`${month.fromDay}T00:00:00Z`),
      )}
    />
  );
}
