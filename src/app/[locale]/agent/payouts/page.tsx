import type { Metadata } from "next";
import { getAppUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dayLong, vnWeekToDate } from "@/lib/dates";
import { vnd } from "@/lib/stats";
import {
  getAgentPayouts,
  getAgentProfile,
  getAgentStats,
} from "@/lib/agentCabinet";
import { PageHeader } from "@/components/cabinet/PageHeader";
import { PageNote } from "@/components/cabinet/PageNote";
import { NoAgentProfile } from "../NoAgentProfile";

export const metadata: Metadata = { title: "Агент · Выплаты" };

// Что школа уже отдала и сколько осталась должна. Список короткий и без
// фильтров: выплат у агента единицы в месяц, и вопрос у него ровно один —
// «когда мне заплатили в прошлый раз и сколько ещё висит».
export default async function AgentPayoutsPage() {
  const user = await getAppUser();
  if (!user) return null; // layout уже средиректил бы; страховка для типов

  const supabase = await createClient();
  const profile = await getAgentProfile(supabase, user.id);
  if (!profile) return <NoAgentProfile />;

  // Период здесь ни на что не влияет — берём текущую неделю только потому, что
  // getAgentStats требует какой-то отрезок; нужны накопительные цифры.
  const [stats, payouts] = await Promise.all([
    getAgentStats(supabase, profile, vnWeekToDate()),
    getAgentPayouts(supabase, profile.id),
  ]);

  return (
    <div>
      <PageHeader title="Выплаты" hint="Что школа уже отдала" />

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-sm text-muted">Заработано всего</p>
          <p className="mt-1 text-2xl font-bold">{vnd(stats.earnedTotal)}</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-sm text-muted">Выплачено</p>
          <p className="mt-1 text-2xl font-bold">{vnd(stats.paidTotal)}</p>
        </div>
        <div className="rounded-2xl border border-primary bg-surface p-4">
          <p className="text-sm text-muted">К выплате</p>
          <p className="mt-1 text-2xl font-bold text-primary">
            {vnd(stats.due)}
          </p>
        </div>
      </div>

      {stats.due < 0 && (
        <PageNote>
          Минус в «к выплате» значит, что деньги выданы вперёд: следующие
          награды сначала закроют этот аванс.
        </PageNote>
      )}

      <section className="mt-6">
        <h2 className="font-bold">История</h2>
        {payouts.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            Выплат пока не было. Как только начальник отдаст деньги, они
            появятся здесь.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {payouts.map((p) => (
              <li
                key={p.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-line bg-surface p-3"
              >
                <div className="min-w-0">
                  <p className="font-semibold">{dayLong(p.paidOn)}</p>
                  {p.comment && (
                    <p className="mt-0.5 text-xs text-muted">«{p.comment}»</p>
                  )}
                </div>
                <span className="shrink-0 whitespace-nowrap font-bold tabular-nums text-primary">
                  {vnd(p.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
