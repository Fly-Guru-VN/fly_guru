"use client";

import { useActionState, useState } from "react";
import { createSessionAction } from "../actions";
import { PhoneField } from "@/components/cabinet/PhoneField";
import { PaymentMethodField } from "@/components/cabinet/PaymentMethodField";
import { vnd } from "@/lib/stats";

// Админская «Запись клиента». Отдельная форма (а не форма сессий), потому что
// инструктор по умолчанию — сам админ (он записывает и иногда сам катает), плюс
// поле города и возможность закрыть заявку. Постит в тот же createSessionAction.

interface Option {
  id: string;
  name: string;
}
interface ServiceOption extends Option {
  price: number;
}

export interface RecordPrefill {
  bookingId?: string;
  name?: string;
  phone?: string;
  serviceId?: string;
  refCode?: string | null;
  refIsAgent?: boolean; // код агента (скидка) или инструктора (без скидки)
  // Положена ли скидка ЭТОМУ гостю: только за первое базовое обучение.
  refDiscount?: boolean;
  telegram?: string | null;
  date?: string; // дата из заявки — на неё и ляжет занятие
  paymentMethodId?: string | null; // способ оплаты из карточки заявки
  paymentMethodName?: string | null;
}

// Единая высота h-10 у всех полей. Дата — компактная (задаёт ширину сама, как
// в расходах): в w-full нативный <input type="date"> распирал ячейку сетки и
// налезал на соседний селект. fieldBase — без ширины, inputClass — на всю.
const fieldBase =
  "h-10 rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-primary";
const inputClass = `w-full ${fieldBase}`;

export function RecordClientForm({
  services,
  staff,
  today,
  defaultInstructorId,
  paymentMethods,
  prefill,
}: {
  services: ServiceOption[];
  staff: Option[];
  today: string;
  defaultInstructorId: string;
  paymentMethods: Option[];
  prefill?: RecordPrefill;
}) {
  const [state, formAction, pending] = useActionState(createSessionAction, {
    error: null,
  });
  const [serviceId, setServiceId] = useState(
    prefill?.serviceId ?? services[0]?.id ?? "",
  );
  const price = services.find((s) => s.id === serviceId)?.price ?? 0;

  return (
    <form action={formAction} className="space-y-3">
      {prefill?.bookingId && (
        <input type="hidden" name="bookingId" value={prefill.bookingId} />
      )}

      {/* Что скажет расчёт при пустой сумме. Раньше здесь было «скидка
          200 000 ₫, если это код агента» — сумма устарела (теперь 10%), а
          «если» перекладывало проверку на человека. Смотрим сами: чей код и
          положена ли гостю скидка (она даётся за ПЕРВОЕ базовое обучение). */}
      {prefill?.refCode &&
        (!prefill.refIsAgent ? (
          <p className="rounded-xl bg-line/40 px-3 py-2 text-sm text-muted">
            Заявка по реф-ссылке инструктора «{prefill.refCode}». Скидки нет — она
            действует только по агентским ссылкам.
          </p>
        ) : prefill.refDiscount === false ? (
          <p className="rounded-xl bg-line/40 px-3 py-2 text-sm text-muted">
            Заявка по агентской ссылке «{prefill.refCode}». Скидки нет — клиент уже
            проходил обучение, она даётся только за первое.
          </p>
        ) : (
          <p className="rounded-xl bg-accent/10 px-3 py-2 text-sm font-medium text-accent-strong">
            Заявка по агентской ссылке «{prefill.refCode}» — к первому базовому
            обучению применится скидка 10% (при пустой сумме).
          </p>
        ))}

      {/* Дата — компактная (как в расходах), «Инструктор» занимает остаток
          строки. Одной высоты, выровнены по низу. */}
      <div className="flex items-end gap-2">
        <label className="flex flex-col items-start text-xs text-muted">
          Дата (можно прошлую)
          <input
            type="date"
            name="date"
            defaultValue={prefill?.date ?? today}
            max={today}
            required
            className={`mt-1 ${fieldBase}`}
          />
        </label>
        <label className="flex-1 text-xs text-muted">
          Инструктор
          <select
            name="instructorId"
            defaultValue={defaultInstructorId}
            className={`mt-1 ${inputClass}`}
          >
            {staff.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block text-xs text-muted">
        Имя клиента *
        <input
          type="text"
          name="newName"
          required
          defaultValue={prefill?.name ?? ""}
          className={`mt-1 ${inputClass}`}
        />
      </label>

      {/* Телефон + подсказка «клиент уже в базе» + ник в телеге (пак B). */}
      <PhoneField
        name="newPhone"
        defaultValue={prefill?.phone ?? ""}
        telegramDefault={prefill?.telegram ?? ""}
        className={inputClass}
      />

      {/* Формат оплаты (пак A, пункт 6) — обязателен, как и в форме сессий:
          обе формы постят в один createSessionAction. Из заявки приезжает уже
          выбранным — он проставлен в её карточке. */}
      <PaymentMethodField
        methods={paymentMethods}
        selectedId={prefill?.paymentMethodId}
        selectedName={prefill?.paymentMethodName}
        className={`mt-1 ${inputClass}`}
        variant="compact"
      />

      <label className="block text-xs text-muted">
        Город
        <input type="text" name="newCity" placeholder="Nha Trang" className={`mt-1 ${inputClass}`} />
      </label>

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
        {pending ? "Сохраняем…" : "Записать клиента"}
      </button>
    </form>
  );
}
