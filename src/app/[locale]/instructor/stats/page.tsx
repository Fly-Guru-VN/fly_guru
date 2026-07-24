import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAppUser } from "@/lib/auth";
import {
  vnCurrentMonth,
  vnPeriod,
  vnPrevMonth,
  vnShiftDays,
  vnToday,
} from "@/lib/dates";
import { getInstructorStats, vnd, type StatsRange } from "@/lib/stats";
import { SHIFT_PAY, SHIFT_PAY_LABEL } from "@/lib/salary";
import { createAdminClient } from "@/lib/supabase/admin";
import { setTourApprovedAction } from "../actions";
import { NATIVE_PICKER } from "@/components/cabinet/fieldClasses";

// «Статистика» за произвольный период. По умолчанию — текущий месяц
// (с 1-го числа); кнопка «Текущий месяц» всегда возвращает к нему, даже если
// наклацал другие периоды. Каждый клиент — отдельный бар (сумма его чеков).

const CATEGORY_LABEL: Record<string, string> = {
  training: "Обучение",
  tandem: "Тандем",
  rental: "Прокат",
  tour: "Туры",
  subscription: "Абонементы",
  extra: "Дополнительно",
  other: "Прочее",
};

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// «24 июля, чт» — дата смены в списке выходов.
function fmtShiftDay(day: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}

const presetClass = (active: boolean) =>
  `rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
    active
      ? "bg-primary text-white"
      : "border border-line text-muted hover:border-primary hover:text-primary"
  }`;

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await getAppUser();
  if (!user) return null; // layout уже средиректил бы; страховка для типов

  const { from, to } = await searchParams;
  const today = vnToday();
  const month = vnCurrentMonth();
  const prev = vnPrevMonth();

  // Период из URL (обе даты включительно); мусор → текущий месяц.
  const custom = Boolean(from && to && DAY_RE.test(from!) && DAY_RE.test(to!) && from! <= to!);
  const range: StatsRange = custom ? vnPeriod(from!, to!) : month;
  // Последний день периода включительно — для подписи и значений инпутов.
  const lastDay = custom ? to! : vnShiftDays(month.toDay, -1);
  const label = custom ? `${from} — ${to}` : month.label;

  const supabase = await createClient();
  // В кабинет инструктора пускают и админа (requireRole — админ суперюзер),
  // но ЗП у него нет: роль решает, начислять слагаемые или показать нули.
  //
  // Пятым аргументом — service-role: с 2026-07-24 доля 15% зависит от ЧУЖИХ
  // сессий и смен того же дня, а их RLS инструктору не отдаёт. Наружу уходит
  // только его собственная доля, чужие суммы на экран не попадают.
  const stats = await getInstructorStats(
    supabase,
    user.id,
    range,
    user.role === "admin" ? "admin" : "instructor",
    createAdminClient(),
  );

  const maxAmount = Math.max(...stats.clientBars.map((b) => b.amount), 1);

  // Допуск к выездам (пак G) для клиентов периода — читаем обычным клиентом
  // (у инструктора есть select на clients), тумблер пишет через service-role.
  const barIds = stats.clientBars.map((b) => b.clientId);
  const { data: approvedRows } = barIds.length
    ? await supabase.from("clients").select("id, tour_approved").in("id", barIds)
    : { data: [] };
  const tourApproved = new Set(
    (approvedRows ?? []).filter((r) => r.tour_approved).map((r) => r.id as string),
  );

  return (
    <div>
      <h1 className="text-2xl font-bold">Статистика</h1>
      <p className="mt-1 text-sm capitalize text-muted">{label}</p>

      {/* Пресеты + свой период */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/instructor/stats" className={presetClass(!custom)}>
          Текущий месяц
        </Link>
        <Link
          href={`/instructor/stats?from=${prev.fromDay}&to=${prev.lastDay}`}
          className={presetClass(custom && from === prev.fromDay && to === prev.lastDay)}
        >
          Прошлый месяц
        </Link>
        <Link
          href={`/instructor/stats?from=${vnShiftDays(today, -6)}&to=${today}`}
          className={presetClass(custom && from === vnShiftDays(today, -6) && to === today)}
        >
          7 дней
        </Link>
      </div>

      {/* Два компактных поля дат стоят рядом, кнопка «Показать» — под ними во
          всю их ширину. w-fit прижимает весь блок к левому краю, в одну линию
          с кнопками пресетов сверху (пачка №5, п.8). Сами поля без w-full/
          flex-1, иначе нативный датапикер вылезает за экран. */}
      <form className="mt-3 flex w-fit flex-col gap-3" action="">
        <div className="flex items-end gap-2">
          <label className="flex flex-col items-start text-xs text-muted">
            С
            <input
              type="date"
              name="from"
              defaultValue={range.fromDay}
              max={today}
              className={`mt-1 ${NATIVE_PICKER} rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary`}
            />
          </label>
          <label className="flex flex-col items-start text-xs text-muted">
            По
            <input
              type="date"
              name="to"
              defaultValue={lastDay}
              max={today}
              className={`mt-1 ${NATIVE_PICKER} rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary`}
            />
          </label>
        </div>
        <button
          type="submit"
          className="w-full rounded-xl border border-primary px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
        >
          Показать
        </button>
      </form>

      {/* Главные цифры */}
      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-sm text-muted">Клиенты</p>
          <p className="mt-1 text-3xl font-bold">{stats.clientsCount}</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-sm text-muted">Занятий</p>
          <p className="mt-1 text-3xl font-bold">{stats.sessionsCount}</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-sm text-muted">Выручка</p>
          <p className="mt-1 text-lg font-bold">{vnd(stats.revenue)}</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-sm text-muted">Средний чек</p>
          <p className="mt-1 text-lg font-bold">{vnd(stats.avgCheck)}</p>
        </div>
      </div>

      {/* ЗП: доля 15% по сменам дня + 300к за зачтённый выход + доля котла */}
      <div className="mt-3 rounded-2xl border-2 border-primary bg-surface p-5">
        <p className="text-sm text-muted">Моя ЗП за период</p>
        <p className="mt-1 text-3xl font-bold text-primary">{vnd(stats.salary)}</p>
        <div className="mt-3 space-y-1 text-sm text-muted">
          <p>15% с занятий — моя доля: {vnd(stats.salaryFromSessions)}</p>
          <p>
            Выходы ({stats.shiftsCount} × {vnd(SHIFT_PAY)}):{" "}
            {vnd(stats.salaryFromShifts)}
          </p>
          <p>
            Абонементы — 15% от продаж инструкторов ({vnd(stats.subsPool)}) поровну
            на {stats.instructorsCount}: {vnd(stats.salaryFromSubs)}
          </p>
        </div>
        <p className="mt-3 text-xs text-muted">
          15% с занятий дня делятся поровну между теми, у кого в этот день смена
          — неважно, кто оформил запись ({stats.sharedDays} дн. в этом периоде).
          В дни без смен 15% идут тому, кто записал ({stats.ownDays} дн.).
          Абонементный котёл общий: сам продал {stats.paidSubsCount} шт. за период.
        </p>
      </div>

      {/* Почему выход не оплачен. Инструктору важнее всего именно это: 300к за
          смену — самая крупная строка его ЗП, и «почему не начислили» он
          должен видеть сам, а не спрашивать админа. */}
      {stats.shiftRows.length > 0 && (
        <div className="mt-3 rounded-2xl border border-line bg-surface p-4">
          <p className="font-bold">Выходы за период</p>
          <p className="mt-1 text-xs text-muted">
            Премия {vnd(SHIFT_PAY)} — за смену, открытую до 9:00 и закрытую
            после 18:00. Не уложился — за этот выход не платят.
          </p>
          <div className="mt-2 space-y-1 text-sm">
            {stats.shiftRows.map((s) => (
              <div key={s.date} className="flex items-baseline justify-between gap-2">
                <span className="text-muted">{fmtShiftDay(s.date)}</span>
                <span
                  className={
                    s.status === "paid"
                      ? "font-semibold text-primary"
                      : "text-right text-xs text-muted"
                  }
                >
                  {s.status === "paid"
                    ? vnd(SHIFT_PAY)
                    : `${SHIFT_PAY_LABEL[s.status]}${s.comment ? ` · ${s.comment}` : ""}`}
                </span>
              </div>
            ))}
          </div>
          {stats.shiftsUnpaidCount > 0 && (
            <p className="mt-2 text-xs text-muted">
              Не зачтено выходов: {stats.shiftsUnpaidCount}. Считаете, что это
              ошибка — скажите админу, премию можно вернуть.
            </p>
          )}
        </div>
      )}

      {stats.unpaidSubsCount > 0 && (
        <div className="mt-3 rounded-2xl border border-dashed border-line bg-surface p-4 text-sm text-muted">
          Ожидают оплату — в ЗП не входят: {stats.unpaidSubsCount} абонемент(а) на{" "}
          {vnd(stats.unpaidSubsSum)}. Когда админ отметит оплату, их 15% пойдут
          в общий котёл.
        </div>
      )}

      {/* Каждый клиент — отдельный бар (сумма чеков за период) */}
      {stats.clientBars.length > 0 && (
        <div className="mt-6 rounded-2xl border border-line bg-surface p-4">
          <p className="font-bold">Клиенты за период</p>
          <div className="mt-3 space-y-3">
            {stats.clientBars.map((c) => (
              <div key={c.clientId}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">{c.name}</span>
                  <span className="shrink-0 font-semibold">
                    {c.amount > 0 ? vnd(c.amount) : `${c.minutes} мин`}
                  </span>
                </div>
                <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-line/50">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.max((c.amount / maxAmount) * 100, 2)}%` }}
                  />
                </div>
                {/* Допуск к выездам (пак G): тумблер ставит противоположное значение */}
                <form action={setTourApprovedAction} className="mt-1">
                  <input type="hidden" name="clientId" value={c.clientId} />
                  <input
                    type="hidden"
                    name="approved"
                    value={tourApproved.has(c.clientId) ? "0" : "1"}
                  />
                  {tourApproved.has(c.clientId) ? (
                    <button
                      type="submit"
                      className="text-xs font-semibold text-accent-strong transition-colors hover:text-muted"
                    >
                      🏝 Допущен к выездам · снять
                    </button>
                  ) : (
                    <button
                      type="submit"
                      className="text-xs font-semibold text-muted transition-colors hover:text-primary"
                    >
                      Допустить к выездам
                    </button>
                  )}
                </form>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">
            Длина бара — сумма чеков клиента. Клиенты с абонементом (списания без
            чека) показаны минутами. «Допустить к выездам» — экскурсия/сафари без
            абонемента, когда клиент уже уверенно катает.
          </p>
        </div>
      )}

      {/* Разбивка выручки по видам услуг + минуты */}
      {(stats.byCategory.length > 0 || stats.minutesWrittenOff > 0) && (
        <div className="mt-3 rounded-2xl border border-line bg-surface p-4">
          <p className="font-bold">По видам услуг</p>
          <div className="mt-2 space-y-1 text-sm text-muted">
            {stats.byCategory.map((c) => (
              <div key={c.category} className="flex justify-between">
                <span>{CATEGORY_LABEL[c.category] ?? c.category}</span>
                <span className="font-semibold text-ink">{vnd(c.amount)}</span>
              </div>
            ))}
            {stats.minutesWrittenOff > 0 && (
              <div className="flex justify-between">
                <span>Списано минут с абонементов</span>
                <span className="font-semibold text-ink">{stats.minutesWrittenOff} мин</span>
              </div>
            )}
          </div>
        </div>
      )}

      {stats.sessionsCount === 0 && (
        <div className="mt-6 rounded-2xl border border-line bg-surface p-6 text-center text-muted">
          За этот период занятий не было. 🌊
        </div>
      )}
    </div>
  );
}
