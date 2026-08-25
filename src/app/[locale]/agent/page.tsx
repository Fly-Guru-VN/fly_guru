import type { Metadata } from "next";
import { getAppUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  dayLabel,
  vnCurrentMonth,
  vnPeriod,
  vnPrevWeek,
  vnRangeLabel,
  vnToday,
  vnWeekToDate,
} from "@/lib/dates";
import { vnd, type StatsRange } from "@/lib/stats";
import { getAgentProfile, getAgentStats } from "@/lib/agentCabinet";
import { PageHeader } from "@/components/cabinet/PageHeader";
import { PageNote } from "@/components/cabinet/PageNote";
import { PeriodBar } from "@/components/cabinet/PeriodBar";
import { NoAgentProfile } from "./NoAgentProfile";

export const metadata: Metadata = { title: "Агент · Статистика" };

// Статистика агента — главный экран кабинета.
//
// Сверху три накопительные цифры (заработано, выплачено, к выплате): они не
// зависят от периода, и именно за ними агент сюда заходит. Ниже — воронка за
// выбранные дни и поимённый список тех, кто по его ссылке пришёл: без имён
// «12 клиентов» ничего агенту не говорит, а спорить о награде приходится
// именно по конкретному человеку.
//
// Чеков клиентов и выручки школы здесь нет намеренно: агент зарабатывает свою
// награду, а не долю с кассы.

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// Крупная цифра с подписью — три штуки в ряд наверху.
function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border bg-surface p-4 ${
        accent ? "border-primary" : "border-line"
      }`}
    >
      <p className="text-sm text-muted">{label}</p>
      <p
        className={`mt-1 text-2xl font-bold ${accent ? "text-primary" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

// Ступень воронки: число и подпись под ним.
function Step({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3 text-center">
      <p className="text-xl font-bold">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

export default async function AgentStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await getAppUser();
  if (!user) return null; // layout уже средиректил бы; страховка для типов

  const supabase = await createClient();
  const profile = await getAgentProfile(supabase, user.id);
  if (!profile) return <NoAgentProfile />;

  const { from, to } = await searchParams;
  const today = vnToday();
  // По умолчанию — текущая неделя по сегодня, как на остальных экранах школы.
  const week = vnWeekToDate();
  const prevWeek = vnPrevWeek();
  const curMonth = vnCurrentMonth();

  const custom = Boolean(
    from && to && DAY_RE.test(from!) && DAY_RE.test(to!) && from! <= to!,
  );
  const range: StatsRange = custom ? vnPeriod(from!, to!) : week;
  const lastDay = custom ? to! : week.lastDay;
  const label = custom
    ? vnRangeLabel(from!, to!)
    : vnRangeLabel(week.fromDay, week.lastDay);

  const stats = await getAgentStats(supabase, profile, range);

  return (
    <div>
      <PageHeader title="Статистика" hint={label} />

      {/* Деньги — первым делом и накопительно: «к выплате» не зависит от того,
          какой период выбран ниже, ровно как «осталось выдать» в админке. */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Заработано всего" value={vnd(stats.earnedTotal)} />
        <Stat label="Выплачено" value={vnd(stats.paidTotal)} />
        <Stat label="К выплате" value={vnd(stats.due)} accent />
      </div>
      <PageNote>
        «К выплате» — это всё заработанное минус всё, что школа уже отдала.
        Награда за человека появляется здесь, когда он дошёл до услуги и
        оплатил её, а не в момент записи.
      </PageNote>

      {!profile.active && (
        <p className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm font-semibold text-amber-700">
          Ссылка сейчас выключена — новые гости по ней записаться не могут.
          Заработанное за прошлые записи никуда не делось.
        </p>
      )}

      <div className="mt-6">
        <h2 className="font-bold">Период</h2>
        <p className="mt-0.5 text-sm text-muted">
          Влияет на воронку и список ниже. Три цифры сверху считаются за всё
          время.
        </p>
      </div>
      <PeriodBar
        presets={[
          { label: "Эта неделя", href: "/agent", active: !custom },
          {
            label: "Прошлая неделя",
            href: `/agent?from=${prevWeek.fromDay}&to=${prevWeek.lastDay}`,
            active: custom && from === prevWeek.fromDay && to === prevWeek.lastDay,
          },
          {
            label: "Этот месяц",
            href: `/agent?from=${curMonth.fromDay}&to=${today}`,
            active: custom && from === curMonth.fromDay && to === today,
          },
        ]}
        fromDay={range.fromDay}
        toDay={lastDay}
        today={today}
      />

      {/* Воронка: слева направо — как человек идёт от ссылки до занятия. */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Step value={stats.visits} label="переходов по ссылке" />
        <Step value={stats.bookings} label="заявок с формы" />
        <Step value={stats.clients} label="пришло людей" />
        <Step value={stats.rewardCount} label="дошли до услуги" />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Stat label="Заработано за период" value={vnd(stats.earned)} />
        <Stat label="Выдано за период" value={vnd(stats.paid)} />
      </div>

      {/* Поимённо: агент должен понимать, кто именно от него пришёл, — иначе
          спорить о награде не с чем (просьба David от 25.08.2026). Телефонов и
          чеков здесь нет: это данные школы, агенту они не нужны. */}
      <section className="mt-6">
        <h2 className="font-bold">Кто пришёл от меня</h2>
        <p className="mt-0.5 text-sm text-muted">
          Всего за всё время: {stats.clientsTotal}.
        </p>
        {stats.clientRows.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            За эти дни по ссылке никто не записался.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {stats.clientRows.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">{c.name}</p>
                  <p className="text-xs text-muted">
                    {dayLabel(c.createdAt.slice(0, 10))}
                  </p>
                </div>
                {c.rewarded ? (
                  <span className="shrink-0 whitespace-nowrap rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                    +{vnd(c.reward)}
                  </span>
                ) : (
                  <span className="shrink-0 whitespace-nowrap rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-muted">
                    пока без награды
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
