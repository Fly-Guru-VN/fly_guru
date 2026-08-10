import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { vnCurrentMonth, vnPeriod, vnShiftDays, vnToday } from "@/lib/dates";
import { vnd } from "@/lib/stats";
import { NATIVE_PICKER } from "@/components/cabinet/fieldClasses";
import { EnteredBadge } from "@/components/cabinet/EnteredBadge";
import { PageHeader } from "@/components/cabinet/PageHeader";

export const metadata: Metadata = { title: "Механик · Сессии" };

// «Сессии» у механика — тот же список, что у инструктора, но по ВСЕЙ школе и
// без правки: он не оформляет занятия, ему нужен ответ на вопрос «что сегодня
// реально откатали и на чём». Править и удалять сессии по-прежнему могут
// только тот, кто её записал, и админ (RLS: sessions_select_mechanic — только
// select).

interface SessionRow {
  id: string;
  date: string;
  amount: number;
  minutes_used: number | null;
  subscription_id: string | null;
  note: string | null;
  created_at: string;
  clients: { name: string } | null;
  services: { name: string } | null;
  payment: { name: string } | null;
  instructor: { name: string } | null;
}

// Поле даты естественной ширины — как в фильтре Статистики.
const dayInputClass =
  "rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function SessionCard({ s }: { s: SessionRow }) {
  const isWriteoff = s.subscription_id !== null;

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{s.clients?.name ?? "Без клиента"}</p>
          <p className="truncate text-xs text-muted">
            {[
              s.date,
              isWriteoff ? `списание ${s.minutes_used ?? 0} мин` : s.services?.name,
              s.instructor?.name && `катал ${s.instructor.name}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {!isWriteoff && (
              <span
                className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-bold ${
                  s.payment
                    ? "bg-emerald-500/10 text-emerald-600"
                    : "bg-amber-500/10 text-amber-600"
                }`}
              >
                <span aria-hidden>💵</span>
                {s.payment?.name ?? "оплата не указана"}
              </span>
            )}
            <EnteredBadge at={s.created_at} />
          </div>
          {s.note && (
            <p className="mt-1 truncate text-xs italic text-muted">📝 {s.note}</p>
          )}
        </div>
        <span
          className={`text-sm font-bold ${isWriteoff ? "text-muted" : "text-primary"}`}
        >
          {isWriteoff ? "абонемент" : vnd(s.amount)}
        </span>
      </div>
    </div>
  );
}

export default async function MechanicSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const month = vnCurrentMonth();
  const today = vnToday();

  // Период: обе даты включительно; по умолчанию — текущий месяц.
  const fromDay = DAY_RE.test(params.from ?? "") ? params.from! : month.fromDay;
  const toInclusive = DAY_RE.test(params.to ?? "")
    ? params.to!
    : vnShiftDays(month.toDay, -1);
  const range = vnPeriod(fromDay, toInclusive);

  const supabase = await createClient();
  const { data } = await supabase
    .from("sessions")
    .select(
      "id, date, amount, minutes_used, subscription_id, note, created_at, clients(name), services(name), payment:payment_methods(name), instructor:users!instructor_id(name)",
    )
    .gte("date", range.fromDay)
    .lt("date", range.toDay)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(300);

  const sessions = (data ?? []) as unknown as SessionRow[];
  const total = sessions.reduce((sum, s) => sum + (s.amount ?? 0), 0);

  return (
    <div>
      <PageHeader
        title="Сессии"
        hint="Все занятия школы за период. Только просмотр."
      />

      {/* Фильтр периода — раскладка как в Статистике: два компактных поля рядом,
          кнопка под ними. Поля БЕЗ w-full — растянутый нативный датапикер ломает
          ряд на телефоне; max={today} держит ширину (иначе Chrome резервирует
          место под пятизначный год). */}
      <form className="mt-4 flex w-fit flex-col gap-3">
        <div className="flex items-end gap-2">
          <label className="flex flex-col items-start text-xs text-muted">
            С
            <input
              type="date"
              name="from"
              defaultValue={fromDay}
              max={today}
              className={`mt-1 ${NATIVE_PICKER} ${dayInputClass}`}
            />
          </label>
          <label className="flex flex-col items-start text-xs text-muted">
            По
            <input
              type="date"
              name="to"
              defaultValue={toInclusive}
              max={today}
              className={`mt-1 ${NATIVE_PICKER} ${dayInputClass}`}
            />
          </label>
        </div>
        <button
          type="submit"
          className="w-full rounded-full border border-line px-4 py-2 text-sm font-semibold text-muted transition-colors hover:border-primary hover:text-primary"
        >
          Показать
        </button>
      </form>

      <p className="mt-4 text-sm text-muted">
        {sessions.length} сессий · <span className="font-bold text-ink">{vnd(total)}</span>
      </p>

      {sessions.length === 0 && (
        <p className="mt-4 text-sm text-muted">За этот период записей нет.</p>
      )}
      <div className="mt-3 space-y-3">
        {sessions.map((s) => (
          <SessionCard key={s.id} s={s} />
        ))}
      </div>
    </div>
  );
}
