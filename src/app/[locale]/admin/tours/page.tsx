import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getAppUser } from "@/lib/auth";
import { vnCurrentMonth, vnPeriod, vnShiftDays, vnToday } from "@/lib/dates";
import { vnd } from "@/lib/stats";
import { getActiveDict, getChannelNames } from "@/lib/dictionaries";
import { hiddenStaffIds, loadSessionStaff, loadShiftCrew } from "@/lib/staff";
import { sortServicesByType } from "@/lib/serviceOrder";
import { loadTours, type TourRow } from "@/lib/toursList";
import { SAFARI_PAY, TOUR_CATEGORY, TOUR_PAY, tourPayFor } from "@/lib/tours";
import { NATIVE_PICKER } from "@/components/cabinet/fieldClasses";
import { PageHeader } from "@/components/cabinet/PageHeader";
import { PageNote } from "@/components/cabinet/PageNote";
import { RecordClientForm } from "../record/RecordClientForm";
import { ConfirmSubmit } from "../ConfirmSubmit";
import { SaveForm } from "../SaveForm";
import {
  deleteSessionAction,
  removeTourParticipantAction,
  updateSessionAction,
} from "../actions";
import { ParticipantAddForm } from "./ParticipantAddForm";

export const metadata: Metadata = { title: "Админка · Экскурсии и сафари" };

// Экскурсии и сафари — отдельно от «Сессий», как абонементы (просьба
// начальника от 06.10.2026): кто возил, сколько людей, кто ехал, сколько
// положено инструктору. Правила денег — lib/tours. Тур остаётся сессией, так
// что выручка, «Статистика» и история клиента видят его как раньше.

const inputClass =
  "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary";
const dayInputClass =
  "rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary";
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function TourCard({
  t,
  staff,
  paymentMethods,
  driverPay,
}: {
  t: TourRow;
  staff: { id: string; name: string }[];
  paymentMethods: { id: string; name: string }[];
  driverPay: number | null; // null — вёз начальник, сотрудникам ничего
}) {
  const names = [t.clients?.name ?? "Без клиента", ...t.participants.map((p) => p.name)];
  return (
    <details className="group rounded-2xl border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-2 p-4 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{names.join(", ")}</p>
          <p className="truncate text-xs text-muted">
            {[t.date, t.services?.name, t.instructor?.name].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-lg bg-line/50 px-2 py-0.5 text-xs font-semibold text-muted">
              <span aria-hidden>👥</span>
              {t.people} чел.
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-bold ${
                t.payment ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"
              }`}
            >
              <span aria-hidden>💵</span>
              {t.payment?.name ?? "оплата не указана"}
            </span>
            <span className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              {driverPay === null ? "вёз начальник — сотрудникам 0" : `инструктору ${vnd(driverPay)}`}
            </span>
          </div>
          {t.note && <p className="mt-1 truncate text-xs italic text-muted">📝 {t.note}</p>}
        </div>
        <span className="text-sm font-bold text-primary">{vnd(t.amount)}</span>
        <span className="text-muted transition-transform group-open:rotate-180">▾</span>
      </summary>

      {/* Участники: контактное лицо — клиент самой сессии, остальные — списком. */}
      <div className="space-y-2 border-t border-line/70 p-4 pt-3">
        <p className="text-xs font-semibold text-muted">Кто ехал</p>
        <ul className="space-y-1 text-sm">
          <li>
            {t.clients?.name ?? "Без клиента"}
            {t.clients?.phone ? ` · ${t.clients.phone}` : ""}{" "}
            <span className="text-xs text-muted">(контакт)</span>
          </li>
          {t.participants.map((p) => (
            <li key={p.id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate">
                {p.name}
                {p.phone ? ` · ${p.phone}` : ""}
              </span>
              <form action={removeTourParticipantAction}>
                <input type="hidden" name="sessionId" value={t.id} />
                <input type="hidden" name="clientId" value={p.id} />
                <ConfirmSubmit
                  message={`Убрать ${p.name} из участников? Клиент останется в базе.`}
                  className="text-xs text-muted hover:text-red-600"
                >
                  убрать
                </ConfirmSubmit>
              </form>
            </li>
          ))}
        </ul>
        <ParticipantAddForm sessionId={t.id} inputClass={inputClass} />
      </div>

      <SaveForm action={updateSessionAction} className="border-t border-line/70 p-4 pt-3">
        <input type="hidden" name="id" value={t.id} />
        <div className="grid grid-cols-2 items-end gap-2">
          <label className="min-w-0 text-xs text-muted">
            Дата
            <input
              type="date"
              name="date"
              defaultValue={t.date}
              className={`mt-1 ${NATIVE_PICKER} ${inputClass}`}
            />
          </label>
          <label className="min-w-0 text-xs text-muted">
            Кто вёз
            <select
              name="instructorId"
              defaultValue={t.instructor_id ?? ""}
              className={`mt-1 ${inputClass}`}
            >
              <option value="">— не менять</option>
              {staff.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 text-xs text-muted">
            Сколько человек
            <input
              type="number"
              name="people"
              min={1}
              max={10}
              step={1}
              defaultValue={t.people}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <label className="min-w-0 text-xs text-muted">
            Сумма за всех, ₫
            <input
              type="text"
              name="amount"
              inputMode="numeric"
              defaultValue={t.amount}
              className={`mt-1 ${inputClass}`}
            />
          </label>
        </div>
        <p className="mt-1 text-xs text-muted">
          Поменяли число людей — поправьте и сумму: сама она не пересчитывается.
        </p>
        <label className="mt-2 block text-xs text-muted">
          Формат оплаты
          <select
            name="paymentMethodId"
            defaultValue={t.payment_method_id ?? ""}
            className={`mt-1 ${inputClass}`}
          >
            <option value="">— не указан —</option>
            {paymentMethods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            {t.payment_method_id && !paymentMethods.some((p) => p.id === t.payment_method_id) && (
              <option value={t.payment_method_id}>{t.payment?.name ?? "прежний способ"}</option>
            )}
          </select>
        </label>
        <label className="mt-2 block text-xs text-muted">
          Дата оплаты (если платили не в день тура)
          <input type="date" name="paidOn" defaultValue={t.paid_on ?? ""} className={`mt-1 ${inputClass}`} />
        </label>
        <label className="mt-2 block text-xs text-muted">
          Примечание
          <textarea name="note" rows={2} defaultValue={t.note ?? ""} className={`mt-1 ${inputClass}`} />
        </label>
        <button
          type="submit"
          className="mt-3 rounded-full border border-line px-4 py-2 text-xs font-semibold text-muted transition-colors hover:border-primary hover:text-primary"
        >
          Сохранить
        </button>
      </SaveForm>

      <form action={deleteSessionAction} className="border-t border-line/70 p-4 pt-3">
        <input type="hidden" name="id" value={t.id} />
        <ConfirmSubmit
          message="Удалить тур? Чек уйдёт из выручки, фикс — из ЗП инструктора."
          className="rounded-full border border-line px-4 py-2 text-xs font-semibold text-muted transition-colors hover:border-red-500 hover:text-red-500"
        >
          Удалить тур
        </ConfirmSubmit>
      </form>
    </details>
  );
}

export default async function AdminToursPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const today = vnToday();
  // По умолчанию — текущий месяц: туров мало, неделя почти всегда пустая.
  const month = vnCurrentMonth();
  const fromDay = DAY_RE.test(params.from ?? "") ? params.from! : month.fromDay;
  const toInclusive = DAY_RE.test(params.to ?? "")
    ? params.to!
    : vnShiftDays(month.toDay, -1);
  const range = vnPeriod(fromDay, toInclusive);

  const supabase = await createClient();
  const admin = await getAppUser();
  const [tours, servicesRes, staffRes, hidden, crew, paymentMethods, channels] =
    await Promise.all([
      loadTours(supabase, range),
      supabase
        .from("services")
        .select("id, name, price, code, category")
        .eq("active", true)
        .eq("category", TOUR_CATEGORY),
      loadSessionStaff(supabase),
      hiddenStaffIds(supabase),
      loadShiftCrew(supabase),
      getActiveDict(supabase, "payment_methods"),
      getChannelNames(supabase),
    ]);

  const services = sortServicesByType(servicesRes.data ?? []).map((s) => ({
    ...s,
    price: Number(s.price ?? 0),
  }));
  const staff = staffRes.filter((u) => !hidden.has(u.id));
  // Фикс за выезд — только полевому составу; тур начальника сотрудникам 0.
  const crewIds = new Set(crew.map((m) => m.id));
  const payOf = (t: TourRow) =>
    t.instructor_id && crewIds.has(t.instructor_id) ? tourPayFor(t.services?.code) : null;

  const revenue = tours.reduce((s, t) => s + Number(t.amount ?? 0), 0);
  const people = tours.reduce((s, t) => s + Number(t.people ?? 1), 0);
  const staffPay = tours.reduce((s, t) => s + (payOf(t) ?? 0), 0);

  return (
    <div>
      <PageHeader title="Экскурсии и сафари" hint="Кто возил, сколько людей, кто ехал" />
      <PageNote>
        Marina с туров не получает ничего, в общий котёл 15% они не идут. Вёз инструктор —
        ему фикс за выезд: экскурсия {vnd(TOUR_PAY)}, сафари {vnd(SAFARI_PAY)}. Вёз начальник —
        сотрудникам ничего. Экскурсия от двух человек — по 3 000 000 ₫ с каждого.
      </PageNote>

      <details className="mt-4 rounded-2xl border border-line bg-surface">
        <summary className="cursor-pointer list-none p-4 font-semibold text-primary [&::-webkit-details-marker]:hidden">
          + Записать тур
        </summary>
        <div className="max-w-xl border-t border-line/70 p-4 pt-3">
          <RecordClientForm
            services={services}
            staff={staff}
            today={today}
            defaultInstructorId={admin?.id ?? staff[0]?.id ?? ""}
            paymentMethods={paymentMethods}
            channels={channels}
          />
        </div>
      </details>

      <form className="mt-4 flex w-fit flex-col gap-3">
        <div className="flex items-end gap-2">
          <label className="flex flex-col items-start text-xs text-muted">
            С
            <input
              type="date"
              name="from"
              defaultValue={fromDay}
              className={`mt-1 ${NATIVE_PICKER} ${dayInputClass}`}
            />
          </label>
          <label className="flex flex-col items-start text-xs text-muted">
            По
            <input
              type="date"
              name="to"
              defaultValue={toInclusive}
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
        {tours.length} выездов · {people} чел. ·{" "}
        <span className="font-bold text-ink">{vnd(revenue)}</span> · инструкторам{" "}
        <span className="font-bold text-ink">{vnd(staffPay)}</span>
      </p>

      {tours.length === 0 && (
        <p className="mt-4 text-sm text-muted">За этот период туров нет.</p>
      )}
      <div className="mt-3 space-y-3">
        {tours.map((t) => (
          <TourCard
            key={t.id}
            t={t}
            staff={staff}
            paymentMethods={paymentMethods}
            driverPay={payOf(t)}
          />
        ))}
      </div>
    </div>
  );
}
