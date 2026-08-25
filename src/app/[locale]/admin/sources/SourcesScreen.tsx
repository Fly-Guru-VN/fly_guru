// Экран «Источники» — общий для админа и СММщика (кабинет /smm): для СММщика
// это вообще главный экран, ради него раздел и делали. Базовый путь приходит
// параметром, всё остальное одинаково.
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  vnCurrentMonth,
  vnPeriod,
  vnPrevMonth,
  vnPrevWeek,
  vnRangeLabel,
  vnToday,
  vnWeekToDate,
} from "@/lib/dates";
import { vnd, type StatsRange } from "@/lib/stats";
import { getSourcesReport, type SourceKind } from "@/lib/sources";
import { PageHeader } from "@/components/cabinet/PageHeader";
import { PeriodBar } from "@/components/cabinet/PeriodBar";
import { CopyLink } from "../CopyLink";

// «Источники»: сколько людей пришло по каждой ссылке и что из этого вышло
// (10.08.2026 — просьба СММщика про ссылки в Instagram и YouTube).
//
// Экран отвечает ровно на один вопрос: какая ссылка приносит деньги, а какая
// висит зря. Строка читается как воронка слева направо — переходы, заявки,
// состоялось, выручка.
//
// Сами ссылки раздаются в «Материалах», здесь только счёт. Кнопка копирования
// у меток всё же есть: смотреть отдачу и тут же взять ссылку — обычный
// сценарий СММщика, гонять его на другой экран незачем.

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// Подпись породы источника — чтобы «0 переходов» у пляжей не читалось как сбой.
const KIND_NOTE: Record<SourceKind, string> = {
  tag: "рекламная ссылка",
  ref: "личная ссылка",
  manual: "записали руками",
  direct: "без метки",
};

function percent(part: number, whole: number): string {
  if (whole <= 0) return "—";
  return `${Math.round((part / whole) * 100)}%`;
}

export async function SourcesScreen({
  searchParams,
  base,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
  /** Кабинет, из которого открыт экран: «/admin» или «/smm». Ссылки внутри
      должны вести туда же, иначе СММщика выкинет middleware. */
  base: string;
}) {
  const { from, to } = await searchParams;
  const today = vnToday();
  // По умолчанию — текущая неделя по сегодня (см. vnWeekToDate).
  const week = vnWeekToDate();
  const prevWeek = vnPrevWeek();
  const curMonth = vnCurrentMonth();
  const prev = vnPrevMonth();

  const custom = Boolean(from && to && DAY_RE.test(from!) && DAY_RE.test(to!) && from! <= to!);
  const range: StatsRange = custom ? vnPeriod(from!, to!) : week;
  const lastDay = custom ? to! : week.lastDay;
  const label = custom ? `${from} — ${to}` : vnRangeLabel(week.fromDay, week.lastDay);

  const supabase = await createClient();
  const report = await getSourcesReport(supabase, range);
  const { totals } = report;

  return (
    <div>
      <PageHeader title="Источники" hint={label} />

      <PeriodBar
        presets={[
          { label: "Эта неделя", href: `${base}/sources`, active: !custom },
          {
            label: "Прошлая неделя",
            href: `${base}/sources?from=${prevWeek.fromDay}&to=${prevWeek.lastDay}`,
            active: custom && from === prevWeek.fromDay && to === prevWeek.lastDay,
          },
          {
            label: "Текущий месяц",
            href: `${base}/sources?from=${curMonth.fromDay}&to=${today}`,
            active: custom && from === curMonth.fromDay && to === today,
          },
          {
            label: "Прошлый месяц",
            href: `${base}/sources?from=${prev.fromDay}&to=${prev.lastDay}`,
            active: custom && from === prev.fromDay && to === prev.lastDay,
          },
        ]}
        fromDay={range.fromDay}
        toDay={lastDay}
        today={today}
      />

      {/* Итоги периода */}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-sm text-muted">Переходов</p>
          <p className="mt-1 text-3xl font-bold">{totals.hits}</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-sm text-muted">Заявок</p>
          <p className="mt-1 text-3xl font-bold">{totals.bookings}</p>
          <p className="text-xs text-muted">
            из переходов: {percent(totals.bookings, totals.hits)}
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-sm text-muted">Состоялось</p>
          <p className="mt-1 text-3xl font-bold">{totals.done}</p>
          <p className="text-xs text-muted">
            из заявок: {percent(totals.done, totals.bookings)}
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-sm text-muted">Выручка</p>
          <p className="mt-1 text-lg font-bold">{vnd(totals.revenue)}</p>
        </div>
      </div>

      {/* Таблица: на телефоне карточками, на ПК таблицей */}
      <div className="mt-4 space-y-3 md:hidden">
        {report.rows.map((r) => (
          <div key={`${r.kind}:${r.key}`} className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 truncate font-bold">{r.label}</p>
              <p className="shrink-0 font-bold tabular-nums text-primary">
                {vnd(r.revenue)}
              </p>
            </div>
            <p className="text-xs text-muted">{KIND_NOTE[r.kind]}</p>
            <div className="mt-2 grid grid-cols-4 gap-2 text-center text-sm tabular-nums">
              <div>
                <p className="font-bold">{r.kind === "tag" || r.kind === "ref" ? r.hits : "—"}</p>
                <p className="text-[11px] text-muted">переходы</p>
              </div>
              <div>
                <p className="font-bold">{r.bookings}</p>
                <p className="text-[11px] text-muted">заявки</p>
              </div>
              <div>
                <p className="font-bold">{r.done}</p>
                <p className="text-[11px] text-muted">состоялось</p>
              </div>
              <div>
                <p className="font-bold">{r.clients}</p>
                <p className="text-[11px] text-muted">клиентов</p>
              </div>
            </div>
            {r.kind === "tag" && (
              <div className="mt-2">
                <CopyLink path={`/?src=${r.key}`} />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 hidden overflow-x-auto rounded-2xl border border-line bg-surface md:block">
        <table className="w-full whitespace-nowrap text-sm">
          <thead>
            <tr className="border-b border-line/70 text-left text-xs text-muted">
              <th className="px-3 py-2 font-semibold">Источник</th>
              <th className="px-3 py-2 text-right font-semibold">Переходы</th>
              <th className="px-3 py-2 text-right font-semibold">Заявки</th>
              <th className="px-3 py-2 text-right font-semibold">Конверсия</th>
              <th className="px-3 py-2 text-right font-semibold">Состоялось</th>
              <th className="px-3 py-2 text-right font-semibold">Отмены</th>
              <th className="px-3 py-2 text-right font-semibold">Клиентов</th>
              <th className="px-3 py-2 text-right font-semibold">Выручка</th>
              <th className="px-3 py-2 font-semibold">Ссылка</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {report.rows.map((r) => (
              <tr key={`${r.kind}:${r.key}`} className="border-b border-line/40">
                <td className="px-3 py-2">
                  <span className="font-semibold">{r.label}</span>
                  <span className="block text-xs text-muted">{KIND_NOTE[r.kind]}</span>
                </td>
                <td className="px-3 py-2 text-right">
                  {r.kind === "tag" || r.kind === "ref" ? (
                    r.hits
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-semibold">{r.bookings}</td>
                <td className="px-3 py-2 text-right text-muted">
                  {r.hits > 0 ? percent(r.bookings, r.hits) : "—"}
                </td>
                <td className="px-3 py-2 text-right">{r.done}</td>
                <td className="px-3 py-2 text-right text-muted">{r.cancelled || "—"}</td>
                <td className="px-3 py-2 text-right">{r.clients}</td>
                <td className="px-3 py-2 text-right font-bold">{vnd(r.revenue)}</td>
                <td className="px-3 py-2">
                  {r.kind === "tag" ? (
                    <CopyLink path={`/?src=${r.key}`} />
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
              </tr>
            ))}
            <tr className="border-t border-line/70 font-bold">
              <td className="px-3 py-2">Итого</td>
              <td className="px-3 py-2 text-right">{totals.hits}</td>
              <td className="px-3 py-2 text-right">{totals.bookings}</td>
              <td className="px-3 py-2 text-right text-muted">
                {percent(totals.bookings, totals.hits)}
              </td>
              <td className="px-3 py-2 text-right">{totals.done}</td>
              <td className="px-3 py-2" />
              <td className="px-3 py-2" />
              <td className="px-3 py-2 text-right text-primary">{vnd(totals.revenue)}</td>
              <td className="px-3 py-2" />
            </tr>
          </tbody>
        </table>
      </div>

      {report.unknownTags.length > 0 && (
        <p className="mt-3 rounded-2xl border border-dashed border-line bg-surface p-4 text-sm text-muted">
          Переходы пришли с меток, которых нет в «Материалах»:{" "}
          <span className="font-semibold text-ink">{report.unknownTags.join(", ")}</span>.
          Метку кто-то написал в ссылке от руки — заведите её в «Материалах», иначе
          в таблице она так и останется технической строкой.
        </p>
      )}

      {/* Оговорки. Без них таблица выглядит точнее, чем есть, и по ней начнут
          принимать решения, которых она не выдерживает. */}
      <div className="mt-3 rounded-2xl border border-line bg-surface p-4 text-xs text-muted">
        <p className="font-semibold text-ink">Как это считается</p>
        <p className="mt-1">
          Переход засчитывается, когда человек открывает страницу по ссылке с
          меткой. Переходы бывают только у ссылок — «Пляжи», «Звонок» и прочее
          ставит инструктор руками при записи, кликов там нет.
        </p>
        <p className="mt-1">
          Метка держится за гостем 30 дней и приезжает с его заявкой. Заявки без
          метки — строка «Прямые заходы»: часть из них на самом деле пришла из
          рекламы, но Safari на iPhone чистит память браузера раньше срока.
        </p>
        <p className="mt-1">
          Выручка — занятия тех клиентов, чьи заявки пришли в этом периоде,
          посчитанные за тот же период. Записался в июле, катался в августе — в
          августовскую строку не попадёт. Конверсия — отношение заявок к
          переходам за период, а не путь конкретного человека: браузер гостя мы
          не метим.
        </p>
        <p className="mt-2">
          Ссылки для рекламы раздаются в{" "}
          <Link href={`${base}/materials`} className="font-semibold text-primary underline">
            «Материалах»
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
