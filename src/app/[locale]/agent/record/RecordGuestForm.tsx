"use client";

import { useActionState, useState } from "react";
import { createAgentBookingAction } from "../actions";
import type { ActionState } from "../../instructor/actions";
import { isValidPhone, PHONE_ERROR } from "@/lib/phone";
import { agentDiscountFor, type AgentPlan } from "@/lib/agentTerms";
// Список услуг тот же, что у формы на сайте (ServiceOption): своего типа не
// заводим — иначе два описания одной и той же строки из базы.
import type { ServiceOption } from "@/components/BookingForm";
import { NATIVE_PICKER } from "@/components/cabinet/fieldClasses";
import { Spinner } from "@/components/Spinner";

// Форма «Записать гостя» в кабинете агента.
//
// Полей ровно столько же, сколько на сайте, минус всё, что нужно только сайту:
// ловушки для ботов и меток рекламы здесь нет — заявку заводит залогиненный
// человек. Реф-код в форму не кладём ВООБЩЕ: сервер берёт его из базы по
// сессии, поэтому подставить чужой код нельзя (см. createAgentBookingAction).

const MESSENGERS = ["WhatsApp", "Telegram", "Zalo"] as const;

const inputClass =
  "w-full rounded-xl border border-line bg-surface px-4 py-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

const vnd = (n: number) => `${n.toLocaleString("ru-RU")} ₫`;

export function RecordGuestForm({
  services,
  plan,
  today,
}: {
  services: ServiceOption[];
  /** Тариф агента: от него зависит скидка, которую видно на карточке услуги. */
  plan: AgentPlan;
  today: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createAgentBookingAction,
    { error: null },
  );

  const [phone, setPhone] = useState("");
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  // Ошибку телефона показываем, только когда он уже похож на законченный: иначе
  // красное загорается с первой цифры и мешает набирать.
  const phoneBad = phone.trim().length >= 6 && !isValidPhone(phone);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="clientName" className="mb-1 block text-sm font-medium">
          Имя гостя *
        </label>
        <input
          id="clientName"
          name="clientName"
          type="text"
          required
          placeholder="Как его зовут"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="contact" className="mb-1 block text-sm font-medium">
          Телефон гостя *
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="contact"
            name="contact"
            type="tel"
            inputMode="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+84 90 123 45 67"
            aria-invalid={phoneBad || undefined}
            className={`${inputClass} sm:flex-1`}
          />
          <select
            name="messenger"
            defaultValue={MESSENGERS[0]}
            className={`${inputClass} sm:w-40`}
          >
            {MESSENGERS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        {phoneBad && <p className="mt-1 text-sm text-red-600">{PHONE_ERROR}</p>}
        <p className="mt-1 text-xs text-muted">
          По этому номеру школа свяжется с гостем — проверьте его при госте.
        </p>
      </div>

      <div>
        <label htmlFor="telegram" className="mb-1 block text-sm font-medium">
          Ник в Telegram
        </label>
        <input
          id="telegram"
          name="telegram"
          type="text"
          autoCapitalize="off"
          autoCorrect="off"
          placeholder="@username"
          className={inputClass}
        />
        <p className="mt-1 text-xs text-muted">
          Необязательно — запасной способ связи
        </p>
      </div>

      {/* Услуга — карточками, как на сайте: только так видно цену и вашу
          скидку. Внутри карточки настоящий radio, форма отправляет его. */}
      <fieldset>
        <legend className="mb-1 block text-sm font-medium">Услуга</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {services.map((s) => {
            const price = s.price ?? null;
            const discount = agentDiscountFor(s.code ?? null, price, plan);
            const chosen = s.id === serviceId;
            return (
              <label
                key={s.id}
                className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors ${
                  chosen
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                    : "border-line bg-surface hover:border-primary/50"
                }`}
              >
                <input
                  type="radio"
                  name="serviceId"
                  value={s.id}
                  checked={chosen}
                  onChange={() => setServiceId(s.id)}
                  className="shrink-0 accent-primary"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium leading-snug">
                    {s.name}
                  </span>
                  {discount > 0 && (
                    <span className="block text-xs font-semibold text-accent-strong">
                      −{vnd(discount)} по вашей ссылке
                    </span>
                  )}
                </span>
                {price !== null && (
                  <span className="shrink-0 text-right text-sm leading-tight">
                    {discount > 0 ? (
                      <>
                        <span className="block text-xs text-muted line-through">
                          {vnd(price)}
                        </span>
                        <span className="font-bold text-primary">
                          {vnd(price - discount)}
                        </span>
                      </>
                    ) : (
                      <span className="font-semibold">{vnd(price)}</span>
                    )}
                  </span>
                )}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div>
        <label htmlFor="preferredDate" className="mb-1 block text-sm font-medium">
          Когда хочет
        </label>
        <input
          id="preferredDate"
          name="preferredDate"
          type="date"
          min={today}
          className={`${NATIVE_PICKER} ${inputClass}`}
        />
      </div>

      <div>
        <label htmlFor="comment" className="mb-1 block text-sm font-medium">
          Комментарий
        </label>
        <textarea
          id="comment"
          name="comment"
          rows={3}
          placeholder="Из какого отеля, на каком языке говорит, во сколько удобно"
          className={inputClass}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-7 py-4 text-base font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
      >
        {pending && <Spinner />}
        {pending ? "Отправляем…" : "Записать гостя"}
      </button>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
