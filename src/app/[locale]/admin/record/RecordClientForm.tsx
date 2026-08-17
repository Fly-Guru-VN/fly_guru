"use client";

import { useActionState, useState } from "react";
import { createSessionAction } from "../actions";
import { PhoneField } from "@/components/cabinet/PhoneField";
import { PaymentMethodField } from "@/components/cabinet/PaymentMethodField";
import { ChannelField } from "@/components/cabinet/ChannelField";
import { vnd } from "@/lib/stats";
import { agentDiscountFor, DEFAULT_AGENT_PLAN, type AgentPlan } from "@/lib/agentTerms";
import { Spinner } from "@/components/Spinner";

// Админская «Запись клиента». Отдельная форма (а не форма сессий), потому что
// инструктор по умолчанию — сам админ (он записывает и иногда сам катает), плюс
// поле города и возможность закрыть заявку. Постит в тот же createSessionAction.

interface Option {
  id: string;
  name: string;
}
interface ServiceOption extends Option {
  price: number;
  code?: string | null; // по нему считается размер агентской скидки
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
  // Тариф агента (agents.terms_plan): у разных агентов разные условия.
  refPlan?: AgentPlan;
  telegram?: string | null;
  date?: string; // дата из заявки — на неё и ляжет занятие
  paymentMethodId?: string | null; // способ оплаты из карточки заявки
  paymentMethodName?: string | null;
  city?: string | null; // город из заявки — второй раз его не спрашиваем
  channel?: string | null; // канал записи из заявки (bookings.src)
  paidOn?: string | null; // дата оплаты из заявки (bookings.paid_on, 0042)
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
  channels,
  prefill,
}: {
  services: ServiceOption[];
  staff: Option[];
  today: string;
  defaultInstructorId: string;
  paymentMethods: Option[];
  channels: string[];
  prefill?: RecordPrefill;
}) {
  const [state, formAction, pending] = useActionState(createSessionAction, {
    error: null,
  });
  const [serviceId, setServiceId] = useState(
    prefill?.serviceId ?? services[0]?.id ?? "",
  );
  const service = services.find((s) => s.id === serviceId);
  const price = service?.price ?? 0;
  // Сколько снимет агентская скидка с ВЫБРАННОЙ сейчас услуги. Размер зависит
  // от тарифа агента: фикс (100 000 ₫ с базового, 200 000 ₫ с парного) или
  // процент от цены. С остальных услуг — ничего.
  const refDiscount = agentDiscountFor(
    service?.code,
    price,
    prefill?.refPlan ?? DEFAULT_AGENT_PLAN,
  );

  return (
    <form action={formAction} className="space-y-3">
      {prefill?.bookingId && (
        <input type="hidden" name="bookingId" value={prefill.bookingId} />
      )}

      {/* Что скажет расчёт при пустой сумме. «Если это код агента» здесь когда-то
          перекладывало проверку на человека — смотрим сами: чей код, положена ли
          гостю скидка (она даётся за ПЕРВОЕ базовое обучение) и сколько она
          составит на выбранной услуге. */}
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
        ) : refDiscount > 0 ? (
          <p className="rounded-xl bg-accent/10 px-3 py-2 text-sm font-medium text-accent-strong">
            Заявка по агентской ссылке «{prefill.refCode}» — при пустой сумме
            применится скидка {vnd(refDiscount)}: чек {vnd(Math.max(0, price - refDiscount))}.
          </p>
        ) : (
          // Услуга без агентских условий (детское базовое, тандем, прокат):
          // записать по ссылке можно, но по обычной цене.
          <p className="rounded-xl bg-line/40 px-3 py-2 text-sm text-muted">
            Заявка по агентской ссылке «{prefill.refCode}». На эту услугу скидки
            нет — она только на базовое и парное обучение.
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

      {/* Когда пришли деньги (0042). Пусто — значит в день занятия. Из заявки
          приезжает заполненной, если гость платил заранее: чек тогда ляжет в
          кассу и в прибыль ТОГО месяца, а ЗП инструктора всё равно считается
          по дню занятия. */}
      <label className="block text-xs text-muted">
        Дата оплаты (если платили не в день занятия)
        <input
          type="date"
          name="paidOn"
          defaultValue={prefill?.paidOn ?? ""}
          max={today}
          className={`mt-1 ${inputClass}`}
        />
      </label>

      {/* Город обязателен (пачка №20): без него не видно, откуда к нам едут.
          У нового клиента он попадёт в карточку, у существующего — заполнит
          пустое поле, уже вписанный город не перетирает. */}
      <label className="block text-xs text-muted">
        Город *
        <input
          type="text"
          name="newCity"
          required
          defaultValue={prefill?.city ?? ""}
          placeholder="Nha Trang"
          className={`mt-1 ${inputClass}`}
        />
      </label>

      {/* Канал записи: список из справочника (0041), по умолчанию «Пляжи»,
          свой вариант — пункт «Другой…». Из заявки приезжает её канал. */}
      <ChannelField
        variant="compact"
        className={inputClass}
        channels={channels}
        defaultValue={prefill?.channel}
      />

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
        {pending && <Spinner className="inline-flex items-center justify-center gap-2 h-4 w-4" />}
        {pending ? "Сохраняем…" : "Записать клиента"}
      </button>
    </form>
  );
}
