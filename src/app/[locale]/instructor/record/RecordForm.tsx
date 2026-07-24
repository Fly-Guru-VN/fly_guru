"use client";

import { useActionState } from "react";
import { recordClientAction, type ActionState } from "../actions";
import { PhoneField } from "@/components/cabinet/PhoneField";
import { PaymentMethodField } from "@/components/cabinet/PaymentMethodField";

const inputClass =
  "w-full rounded-xl border border-line bg-surface px-4 py-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

export interface RecordPrefill {
  bookingId?: string;
  name?: string;
  phone?: string;
  serviceId?: string;
  refCode?: string | null;
  refIsAgent?: boolean; // код агента (скидка) или инструктора (без скидки)
  // Положена ли скидка ЭТОМУ гостю: она даётся за первое базовое обучение,
  // и повторному клиенту по той же ссылке её уже не будет.
  refDiscount?: boolean;
  telegram?: string | null;
  paymentMethodId?: string | null; // способ оплаты, выбранный админом в заявке
  paymentMethodName?: string | null;
}

interface RecordFormProps {
  services: { id: string; name: string }[];
  today: string; // 'YYYY-MM-DD' по Вьетнаму — с сервера, чтобы не зависеть от часов телефона
  paymentMethods: { id: string; name: string }[];
  prefill?: RecordPrefill;
}

export function RecordForm({
  services,
  today,
  paymentMethods,
  prefill,
}: RecordFormProps) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    recordClientAction,
    { error: null },
  );

  return (
    <form action={formAction} className="space-y-4">
      {prefill?.bookingId && (
        <input type="hidden" name="bookingId" value={prefill.bookingId} />
      )}

      {prefill?.refCode &&
        (prefill.refIsAgent ? (
          prefill.refDiscount === false ? (
            // Гость уже проходил у нас базовое обучение — скидка положена
            // только за первое, и второй раз система её не даст. Раньше
            // подпись обещала её всё равно (пачка №6, п.5 — хвост по тексту).
            <p className="rounded-xl bg-line/40 px-4 py-3 text-sm text-muted">
              Заявка по агентской ссылке «{prefill.refCode}». Скидки нет — клиент
              уже проходил обучение, она даётся только за первое.
            </p>
          ) : (
            <p className="rounded-xl bg-accent/10 px-4 py-3 text-sm font-medium text-accent-strong">
              Заявка по агентской ссылке «{prefill.refCode}» — на первое базовое
              обучение автоматически применится скидка 10%.
            </p>
          )
        ) : (
          <p className="rounded-xl bg-line/40 px-4 py-3 text-sm text-muted">
            Заявка по реф-ссылке инструктора «{prefill.refCode}». Скидки нет — она
            действует только по агентским ссылкам.
          </p>
        ))}

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

      {/* Телефон + подсказка «клиент уже в базе» + ник в телеге (пак B). */}
      <PhoneField
        defaultValue={prefill?.phone ?? ""}
        telegramDefault={prefill?.telegram ?? ""}
        className={inputClass}
      />

      {/* Город — только для НОВОГО клиента (у существующего берётся из карточки
          и не перезаписывается). Необязательное поле. */}
      <div>
        <label htmlFor="city" className="mb-1 block text-sm font-medium">
          Город
        </label>
        <input
          id="city"
          name="city"
          type="text"
          placeholder="Nha Trang"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="serviceId" className="mb-1 block text-sm font-medium">
          Услуга *
        </label>
        <select
          id="serviceId"
          name="serviceId"
          required
          defaultValue={prefill?.serviceId ?? services[0]?.id ?? ""}
          className={inputClass}
        >
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* Формат оплаты (пак A, пункт 6) — обязателен: занятие уже проведено и
          оплачено, так что «чем платили» известно всегда. Если запись открыли из
          заявки, способ приезжает уже выбранным — его указал админ. */}
      <PaymentMethodField
        methods={paymentMethods}
        selectedId={prefill?.paymentMethodId}
        selectedName={prefill?.paymentMethodName}
        className={inputClass}
      />

      {/* Примечание к занятию (пачка №9, пак 3): то же поле, что у админа.
          Инструктору есть что сказать про занятие — «катал с сыном», «доска
          №2», «обещали вернуться в пятницу», — и раньше это оседало только в
          голове. Необязательное: заставлять писать по строчке к каждой записи
          на пляже никто не будет. */}
      <div>
        <label htmlFor="note" className="mb-1 block text-sm font-medium">
          Примечание
        </label>
        <textarea
          id="note"
          name="note"
          rows={2}
          placeholder="Например: доска №2, обещал вернуться в пятницу"
          className={inputClass}
        />
      </div>

      {/* Инструктор записывает только текущим днём — дату не выбирают, просто
          показываем её. Записи задним числом делает админ. */}
      <div>
        <span className="mb-1 block text-sm font-medium">Дата занятия</span>
        <p className="rounded-xl border border-line bg-surface px-4 py-3 text-base text-muted">
          Сегодня, {today}
        </p>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center rounded-full bg-accent px-7 py-4 text-base font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
      >
        {pending ? "Записываем…" : "Записать"}
      </button>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
