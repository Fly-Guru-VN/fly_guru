"use client";

import { useActionState, useState } from "react";
import { sellSubscriptionAction, type ActionState } from "../actions";
import { PaymentMethodField } from "@/components/cabinet/PaymentMethodField";
import { Spinner } from "@/components/Spinner";

const inputClass =
  "w-full rounded-xl border border-line bg-surface px-4 py-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

// «Кто взял деньги»: от ответа зависит, отмечать ли оплату и что увидит админ.
type PaymentChoice = "me" | "admin" | "unclear";

const PAYMENT_CHOICES: { value: PaymentChoice; label: string; hint: string }[] = [
  {
    value: "me",
    label: "Оплату принял я",
    hint: "QR, крипта, наличные — деньги на руках. Оплата отметится сразу.",
  },
  {
    value: "admin",
    label: "Оплату принял админ",
    hint: "Клиент уже заплатил мимо CRM. Админ подтвердит — тогда деньги встанут в отчёт.",
  },
  {
    value: "unclear",
    label: "С оплатой непонятно",
    hint: "Оформить абонемент нужно сейчас, с деньгами разберётся админ.",
  },
];

export interface SubscriptionPrefill {
  bookingId: string;
  name: string;
  phone: string;
  telegram: string | null;
  paymentMethodId?: string | null; // способ оплаты, выбранный админом в заявке
  paymentMethodName?: string | null;
}

export function SubscriptionForm({
  prefill,
  paymentMethods,
}: {
  prefill?: SubscriptionPrefill;
  paymentMethods: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    sellSubscriptionAction,
    { error: null },
  );
  // Три состояния оплаты вместо прежнего флажка (пачка №10, п.5). Раньше выбор
  // был двоичным — «получена» или «нет», — и случай «деньги взял админ, в CRM
  // их не занесли, клиент уже пришёл кататься» инструктору было нечем оформить:
  // отметить оплату он не вправе (её не видел), а без абонемента списывать
  // минуты не с чего.
  const [payment, setPayment] = useState<PaymentChoice>("me");

  return (
    <form action={formAction} className="space-y-4">
      {prefill && (
        <>
          <input type="hidden" name="bookingId" value={prefill.bookingId} />
          {prefill.telegram && (
            <input type="hidden" name="telegramUsername" value={prefill.telegram} />
          )}
        </>
      )}
      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-medium">
          Имя клиента *
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={prefill?.name ?? ""}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="phone" className="mb-1 block text-sm font-medium">
          Телефон *
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          required
          defaultValue={prefill?.phone ?? ""}
          className={inputClass}
        />
      </div>

      {/* Оплата. Первый вариант — типовой (деньги на месте), поэтому выбран по
          умолчанию. «Принял админ» и «под вопросом» оплату НЕ отмечают: до
          подтверждения админом абонемент не входит ни в выручку, ни в котёл. */}
      <fieldset className="space-y-2">
        <legend className="mb-1 block text-sm font-medium">Оплата *</legend>
        {PAYMENT_CHOICES.map((choice) => (
          <label
            key={choice.value}
            className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
              payment === choice.value
                ? "border-primary bg-primary/5"
                : "border-line bg-surface"
            }`}
          >
            <input
              type="radio"
              name="payment"
              value={choice.value}
              checked={payment === choice.value}
              onChange={() => setPayment(choice.value)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-primary,#0e8a9e)]"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{choice.label}</span>
              <span className="block text-xs text-muted">{choice.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {payment === "me" && (
        <PaymentMethodField
          methods={paymentMethods}
          selectedId={prefill?.paymentMethodId}
          selectedName={prefill?.paymentMethodName}
          className={inputClass}
        />
      )}

      {payment !== "me" && (
        <div>
          <label htmlFor="paymentClaimNote" className="mb-1 block text-sm font-medium">
            Что передать админу
          </label>
          <input
            id="paymentClaimNote"
            name="paymentClaimNote"
            type="text"
            placeholder={
              payment === "admin"
                ? "Например: платил переводом Диме 24 июля"
                : "Например: клиент говорит, что заплатил, чек не показал"
            }
            className={inputClass}
          />
          <p className="mt-1 text-xs text-muted">
            Абонемент оформится, минуты списывать можно сразу. Оплату отметит
            админ — до этого абонемент не входит ни в выручку, ни в котёл 15%.
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center rounded-full bg-accent px-7 py-4 text-base font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
      >
        {pending && <Spinner className="inline-flex items-center justify-center gap-2 h-4 w-4" />}
        {pending ? "Оформляем…" : "Продать абонемент"}
      </button>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
