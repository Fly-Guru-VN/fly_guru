"use client";

import { useActionState } from "react";
import { extendSubscriptionAction, type ActionState } from "../actions";
import { EXTENSION_MONTHS, EXTENSION_PRICE } from "@/lib/subscriptionExtensions";
import {
  PaymentMethodField,
  type PaymentMethodOption,
} from "@/components/cabinet/PaymentMethodField";
import { Spinner } from "@/components/Spinner";

const inputClass =
  "w-full rounded-xl border border-line bg-surface px-4 py-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

// Продление действующего абонемента за доплату (0062). Цена и срок зашиты —
// инструктор выбирает только, чем заплатили. confirm() перед отправкой:
// продление сразу попадает в выручку и в котёл.
export function ExtendForm({
  clientId,
  clientName,
  paymentMethods,
}: {
  clientId: string;
  clientName: string;
  paymentMethods: PaymentMethodOption[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    extendSubscriptionAction,
    { error: null },
  );
  const price = new Intl.NumberFormat("ru-RU").format(EXTENSION_PRICE);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm(`Продлить абонемент на ${EXTENSION_MONTHS} месяца за ${price} ₫? Деньги от клиента должны быть уже у вас.`)) {
          e.preventDefault();
        }
      }}
      className="space-y-4"
    >
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="clientName" value={clientName} />
      <PaymentMethodField methods={paymentMethods} className={inputClass} />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-primary px-7 py-4 text-base font-semibold text-primary transition-colors hover:bg-primary/5 disabled:opacity-60"
      >
        {pending && <Spinner />}
        {pending ? "Продлеваем…" : `Продлить на ${EXTENSION_MONTHS} месяца — ${price} ₫`}
      </button>
    </form>
  );
}
