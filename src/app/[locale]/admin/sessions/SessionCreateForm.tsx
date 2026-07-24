"use client";

import { useActionState, useState } from "react";
import { createSessionAction } from "../actions";
import { vnd } from "@/lib/stats";
import { NATIVE_PICKER } from "@/components/cabinet/fieldClasses";

// Форма «создать сессию задним числом». Клиентский компонент ради двух вещей:
// показать ошибку валидации без перезагрузки (useActionState) и подсказать
// цену выбранной услуги в поле суммы.

export interface Option {
  id: string;
  name: string;
}
export interface ClientOption extends Option {
  phone: string | null;
}
export interface ServiceOption extends Option {
  price: number;
}

const inputClass =
  "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary";

export function SessionCreateForm({
  clients,
  services,
  staff,
  today,
  paymentMethods,
}: {
  clients: ClientOption[];
  services: ServiceOption[];
  staff: Option[];
  today: string;
  paymentMethods: Option[];
}) {
  const [state, formAction, pending] = useActionState(createSessionAction, {
    error: null,
  });
  const [clientId, setClientId] = useState("");
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");

  const price = services.find((s) => s.id === serviceId)?.price ?? 0;

  return (
    <form action={formAction} className="space-y-3">
      {/* items-end + min-w-0: подпись «Дата (можно прошлую)» на телефоне
          переносится, а нативный датапикер распирает свою колонку. */}
      <div className="grid grid-cols-2 items-end gap-2">
        <label className="min-w-0 text-xs text-muted">
          Дата (можно прошлую)
          <input
            type="date"
            name="date"
            defaultValue={today}
            max={today}
            required
            className={`mt-1 ${NATIVE_PICKER} ${inputClass}`}
          />
        </label>
        <label className="min-w-0 text-xs text-muted">
          Инструктор
          <select name="instructorId" className={`mt-1 ${inputClass}`}>
            {staff.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Формат оплаты (пак A, пункт 6) — обязателен. Пустого варианта нет:
          иначе он молча стал бы значением по умолчанию. */}
      <label className="block text-xs text-muted">
        Формат оплаты
        <select
          name="paymentMethodId"
          required
          defaultValue=""
          className={`mt-1 ${inputClass}`}
        >
          <option value="" disabled>
            Выберите…
          </option>
          {paymentMethods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-xs text-muted">
        Клиент
        <select
          name="clientId"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className={`mt-1 ${inputClass}`}
        >
          <option value="">— новый клиент —</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.phone ? ` · ${c.phone}` : ""}
            </option>
          ))}
        </select>
      </label>

      {clientId === "" && (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-muted">
            Имя нового клиента *
            <input
              type="text"
              name="newName"
              required
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <label className="text-xs text-muted">
            Телефон *
            <input
              type="tel"
              name="newPhone"
              required
              className={`mt-1 ${inputClass}`}
            />
          </label>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-muted">
          Услуга
          <select
            name="serviceId"
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            className={`mt-1 ${inputClass}`}
          >
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted">
          Сумма чека, ₫
          <input
            type="text"
            name="amount"
            inputMode="numeric"
            placeholder={`по прайсу: ${vnd(price)}`}
            className={`mt-1 ${inputClass}`}
          />
        </label>
      </div>

      <label className="block text-xs text-muted">
        Примечание
        <textarea
          name="note"
          rows={2}
          placeholder="Что важно помнить про это занятие"
          className={`mt-1 ${inputClass}`}
        />
      </label>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
      >
        {pending ? "Сохраняем…" : "Создать сессию"}
      </button>
    </form>
  );
}
