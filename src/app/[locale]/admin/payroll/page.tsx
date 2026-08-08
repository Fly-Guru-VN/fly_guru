import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  vnCurrentMonth,
  vnMonth,
  vnPeriod,
  vnPrevMonth,
  vnPrevWeek,
  vnRangeLabel,
  vnShiftDays,
  vnWeekOf,
} from "@/lib/dates";
import { vnd } from "@/lib/stats";
import { SHIFT_PAY } from "@/lib/salary";
import { getMonthlyPayroll } from "@/lib/payroll";
import { NATIVE_PICKER } from "@/components/cabinet/fieldClasses";
import { PaidOutToggle } from "./PaidOutToggle";

export const metadata: Metadata = { title: "Админка · Расчёт выплат" };

// Расчёт выплат: кому и сколько отдать за выбранный период. Инструкторы —
// 15% занятий + выходы + доля абонементов, оплаченных В ЭТОМ периоде (по дате
// оплаты, не продажи — цифры совпадают со статистикой в кабинете инструктора).
// Агенты — награды, подтверждённые в периоде. Excel/CSV — та же таблица файлом.
//
// Период любой, а не только месяц: инструкторам платят раз в неделю, и раньше
// начальник считал недельную выплату руками по месячной таблице. Все слагаемые
// привязаны к датам (смена — к своей дате, занятие — к своей, абонемент — к
// дате оплаты, награда — к дате подтверждения), поэтому недели складываются в
// месяц без нахлёста и потерь.

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const presetClass = (active: boolean) =>
  `rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
    active
      ? "bg-primary text-white"
      : "border border-line text-muted hover:border-primary hover:text-primary"
  }`;

// Строка выплаты: за что платим — слева, сумма — справа, подробности мелким
// под ней. Раньше все подробности («занятия (12) · 10 000 000 ₫») лезли в саму
// подпись, и на телефоне их срезало `truncate`: строка обрывалась на середине,
// а из-за подписи «Занятия (0) · 0 ₫» рядом с суммой 562 500 ₫ расчёт выглядел
// сломанным. Теперь подпись короткая (не обрезается), а цифры — отдельной
// строкой под ней. Пунктирная выноска осталась только на широком экране: на
// телефоне она превращалась в обрубок в пару пикселей.
function Row({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2 text-sm">
        <span className="min-w-0 text-muted">{label}</span>
        <span className="hidden min-w-4 flex-1 border-b border-dotted border-line sm:block" />
        <span className="ml-auto shrink-0 font-semibold tabular-nums sm:ml-0">
          {value}
        </span>
      </div>
      {hint && <p className="text-xs text-muted/80">{hint}</p>}
    </div>
  );
}

export default async function AdminPayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; m?: string }>;
}) {
  const { from, to, m } = await searchParams;

  const week = vnWeekOf(); // текущая неделя, пн–вс
  const prevWeek = vnPrevWeek();
  const curMonth = vnCurrentMonth();
  const monthLast = vnShiftDays(curMonth.toDay, -1);
  const prevMonth = vnPrevMonth();

  // Период целиком, без обрезки по «сегодня»: в середине недели полезно видеть
  // не только заработанное, но и строку «в графике ещё N смен».
  const custom = Boolean(from && to && DAY_RE.test(from) && DAY_RE.test(to) && from <= to);
  // Старые ссылки вида ?m=2026-07 (их раздавал переключатель месяцев) должны
  // продолжать открываться — теперь как обычный период «месяц целиком».
  const legacy = !custom && /^\d{4}-\d{2}$/.test(m ?? "") ? vnMonth(m!) : null;

  const fromDay = custom ? from! : (legacy?.fromDay ?? week.fromDay);
  const lastDay = custom
    ? to!
    : legacy
      ? vnShiftDays(legacy.toDay, -1)
      : week.lastDay;

  const range = vnPeriod(fromDay, lastDay);
  const label = vnRangeLabel(fromDay, lastDay);
  const periodQs = `from=${fromDay}&to=${lastDay}`;

  // Пресет активен, если совпали обе границы: так «Эта неделя» подсвечена и
  // при заходе без параметров, и по прямой ссылке с датами.
  const isPreset = (f: string, l: string) => fromDay === f && lastDay === l;

  const supabase = await createClient();
  const payroll = await getMonthlyPayroll(supabase, range);

  return (
    <div>
      <h1 className="text-2xl font-bold">Расчёт выплат</h1>
      <p className="mt-1 text-sm text-muted">
        Выплаты по факту оплаты: абонемент попадает в расчёт в период оплаты,
        награда агента — в период подтверждения.
      </p>

      {/* Пресеты периода. Неделя первой: инструкторам платят раз в неделю. */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        <Link
          href={`/admin/payroll?from=${week.fromDay}&to=${week.lastDay}`}
          className={presetClass(isPreset(week.fromDay, week.lastDay))}
        >
          Эта неделя
        </Link>
        <Link
          href={`/admin/payroll?from=${prevWeek.fromDay}&to=${prevWeek.lastDay}`}
          className={presetClass(isPreset(prevWeek.fromDay, prevWeek.lastDay))}
        >
          Прошлая неделя
        </Link>
        <Link
          href={`/admin/payroll?from=${curMonth.fromDay}&to=${monthLast}`}
          className={presetClass(isPreset(curMonth.fromDay, monthLast))}
        >
          Этот месяц
        </Link>
        <Link
          href={`/admin/payroll?from=${prevMonth.fromDay}&to=${prevMonth.lastDay}`}
          className={presetClass(isPreset(prevMonth.fromDay, prevMonth.lastDay))}
        >
          Прошлый месяц
        </Link>
      </div>

      {/* Свой период. Поля без w-full: нативный датапикер на телефоне
          растягивается и вылезает за экран (см. «Статистику»). */}
      <form className="mt-3 flex w-fit flex-col gap-3" action="">
        <div className="flex items-end gap-2">
          <label className="flex flex-col items-start text-xs text-muted">
            С
            <input
              type="date"
              name="from"
              defaultValue={fromDay}
              className={`mt-1 ${NATIVE_PICKER} rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary`}
            />
          </label>
          <label className="flex flex-col items-start text-xs text-muted">
            По
            <input
              type="date"
              name="to"
              defaultValue={lastDay}
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

      <div className="mt-3 rounded-2xl border border-line bg-surface p-4">
        <p className="text-xs text-muted">Итого к выплате за {label}</p>
        <p className="mt-1 text-3xl font-bold text-primary">{vnd(payroll.grandTotal)}</p>
        {/* Сколько из этого уже роздано: начисление и выдача — разные события,
            и раньше их путали (в «Расходах» ЗП уже списана, а деньги ещё в
            кармане). Отметки ставятся кнопкой у каждого инструктора ниже. */}
        {payroll.paidOutTotal > 0 && (
          <p className="mt-1 text-xs text-muted">
            Инструкторам уже выдано: {vnd(payroll.paidOutTotal)}
          </p>
        )}
        {/* Excel — первой кнопкой: CSV русский Excel открывает одной склеенной
            колонкой (разделителем он считает запятую, а не точку с запятой).
            CSV оставлен рядом — он нужен, если файл заряжают в другую
            программу или в таблицы Google. */}
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={`/api/admin/payroll?${periodQs}&format=xlsx`}
            download
            className="rounded-full border border-primary px-4 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
          >
            Скачать Excel
          </a>
          <a
            href={`/api/admin/payroll?${periodQs}`}
            download
            className="rounded-full border border-line px-4 py-2 text-xs font-semibold text-muted transition-colors hover:border-primary hover:text-primary"
          >
            CSV
          </a>
        </div>
      </div>

      <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-bold">
          Инструкторы · {vnd(SHIFT_PAY)} за выход + 15% занятий + доля абонементов
        </h2>
        <p className="mt-1 text-xs text-muted">
          За выход платим, если смена закрыта, открыта до 9:00 и закрыта после
          18:00 (премию можно снять руками в календаре). 15% с занятий дня
          делятся поровну между теми, кто в этот день открыл смену — даже если
          смена не стояла в календаре; если не открылся никто, делим между
          назначенными, а в дни совсем без смен 15% идут тому, кто записал. 15% с абонементов, проданных инструкторами,
          делится между ними поровну. Ваши сессии и абонементы в расчёт не идут.
        </p>
        <div className="mt-3 space-y-4">
          {payroll.instructors.map((i) => (
            <div key={i.id}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="min-w-0 font-semibold">
                  {i.name}
                  {i.employmentLabel && (
                    <span className="ml-2 text-[11px] font-normal text-muted">
                      {i.employmentLabel}
                    </span>
                  )}
                </p>
                <p className="shrink-0 font-bold text-primary">{vnd(i.total)}</p>
              </div>
              <div className="mt-1 space-y-1.5">
                {/* Сумма тут — доля с занятий ДНЯ, а не 15% со своих чеков:
                    она делится между вышедшими на смену. Поэтому подпись
                    говорит про долю, а собственные занятия ушли в пояснение —
                    иначе «Занятия (0)» рядом с полумиллионом читалось как сбой
                    (у человека действительно бывает 0 своих записей и при этом
                    доля за день, отработанный в паре). */}
                <Row
                  label="Доля 15% с занятий дня"
                  value={vnd(i.salaryFromSessions)}
                  hint={`свои занятия: ${i.sessionsCount} на ${vnd(i.sessionsRevenue)}`}
                />
                <Row
                  label={`Выходы · зачтено ${i.shiftsCount} из ${i.shiftsCount + i.shiftsUnpaidCount}`}
                  value={vnd(i.salaryFromShifts)}
                  hint={[
                    i.shiftsUnpaidCount > 0
                      ? `не зачтено ${i.shiftsUnpaidCount} — регламент или снятая премия`
                      : null,
                    // Будущие смены месяца больше не висят в «не зачтено»
                    // (см. getShiftPay), но показать их полезно: видно, сколько
                    // ещё добавится к выплате, если график отработают.
                    i.shiftsPlannedCount > 0
                      ? `в графике ещё ${i.shiftsPlannedCount} — до ${vnd(i.shiftsPlannedCount * SHIFT_PAY)}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                />
                <Row
                  label="Доля с абонементов"
                  value={vnd(i.salaryFromSubs)}
                  hint={`продал сам: ${i.paidSubsCount}`}
                />
              </div>
              <PaidOutToggle
                instructorId={i.id}
                from={fromDay}
                to={lastDay}
                amount={i.total}
                paidOut={i.paidOut}
              />
            </div>
          ))}
          {payroll.instructors.length === 0 && (
            <p className="text-sm text-muted">Инструкторов нет.</p>
          )}
        </div>
      </section>

      {/* Доля за CRM. Считается ВСЕГДА за календарный месяц, даже когда выбрана
          неделя: инструкторам платят понедельно, а эта доля закрывается раз в
          месяц (решение David от 08.08.2026). Поэтому в «Итого к выплате» за
          неделю она не входит — иначе к недельной сумме прибавлялась бы
          месячная, и цифра в шапке не сходилась бы ни с чем. */}
      <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-bold">CRM · 2% с выручки пополам</h2>
        <p className="mt-1 text-xs text-muted">
          Считается помесячно: {payroll.crmMonthLabel} целиком. База — занятия
          месяца плюс абонементы, оплаченные в нём: {vnd(payroll.crm.revenue)}.
          {!payroll.crmInTotal &&
            " В «Итого к выплате» за выбранный период эта сумма не входит."}
        </p>
        <div className="mt-3 space-y-1">
          {payroll.crm.partners.map((name) => (
            <Row key={name} label={`${name} · 1%`} value={vnd(payroll.crm.each)} />
          ))}
          <div className="flex items-baseline justify-between gap-2 pt-1">
            <p className="text-sm font-semibold">Итого CRM</p>
            <p className="font-bold text-primary">{vnd(payroll.crm.total)}</p>
          </div>
        </div>
      </section>

      <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-bold">Агенты · за приведённых клиентов</h2>
        <div className="mt-3 space-y-3">
          {payroll.agents.map((a) => (
            <div key={a.id}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-semibold">{a.name}</p>
                <p className="font-bold text-primary">{vnd(a.total)}</p>
              </div>
              <p className="text-xs text-muted">Приведено клиентов: {a.confirmedCount}</p>
            </div>
          ))}
          {payroll.agents.length === 0 && (
            <p className="text-sm text-muted">Выплат агентам за этот период нет.</p>
          )}
        </div>
      </section>
    </div>
  );
}
