"use client";

import { useActionState, useState } from "react";
import { recordClientAction, type ActionState } from "../actions";
import { agentDiscountFor } from "@/lib/agentTerms";
import { vnd } from "@/lib/stats";
import { PhoneField } from "@/components/cabinet/PhoneField";
import { PaymentMethodField } from "@/components/cabinet/PaymentMethodField";
import { ChannelField } from "@/components/cabinet/ChannelField";
import { NATIVE_PICKER } from "@/components/cabinet/fieldClasses";
import { recordDateBounds } from "@/lib/recordDate";
import { Spinner } from "@/components/Spinner";

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
  city?: string | null; // город из заявки
  channel?: string | null; // канал записи из заявки (bookings.src)
}

interface RecordFormProps {
  // code — по нему видно, есть ли на услуге агентская скидка и какая.
  services: { id: string; name: string; code?: string | null }[];
  today: string; // 'YYYY-MM-DD' по Вьетнаму — с сервера, чтобы не зависеть от часов телефона
  paymentMethods: { id: string; name: string }[];
  channels: string[]; // справочник каналов записи (0041)
  prefill?: RecordPrefill;
}

export function RecordForm({
  services,
  today,
  paymentMethods,
  channels,
  prefill,
}: RecordFormProps) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    recordClientAction,
    { error: null },
  );

  // Окно дат считаем от даты, пришедшей с сервера: часы телефона могут врать, а
  // от даты занятия зависят ЗП инструктора и статистика месяца.
  const { min, max } = recordDateBounds(today);

  // Выбранная услуга — чтобы подпись про скидку называла её настоящий размер:
  // он разный у базового (100 000 ₫) и парного (200 000 ₫), а на остальных
  // услугах скидки нет вовсе.
  const [serviceId, setServiceId] = useState(
    prefill?.serviceId ?? services[0]?.id ?? "",
  );
  const refDiscount = agentDiscountFor(
    services.find((s) => s.id === serviceId)?.code,
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
          ) : refDiscount > 0 ? (
            <p className="rounded-xl bg-accent/10 px-4 py-3 text-sm font-medium text-accent-strong">
              Заявка по агентской ссылке «{prefill.refCode}» — на первое базовое
              обучение автоматически применится скидка {vnd(refDiscount)}.
            </p>
          ) : (
            // Услуга без агентских условий (детское базовое, тандем, прокат):
            // записать по ссылке можно, но по обычной цене.
            <p className="rounded-xl bg-line/40 px-4 py-3 text-sm text-muted">
              Заявка по агентской ссылке «{prefill.refCode}». На выбранную услугу
              скидки нет — она только на базовое и парное обучение.
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

      {/* Город обязателен (пачка №20). У нового клиента он ляжет в карточку,
          у существующего заполнит пустое поле — уже вписанный город не
          перетирается. Из заявки приезжает заполненным. */}
      <div>
        <label htmlFor="city" className="mb-1 block text-sm font-medium">
          Город *
        </label>
        <input
          id="city"
          name="city"
          type="text"
          required
          defaultValue={prefill?.city ?? ""}
          placeholder="Nha Trang"
          className={inputClass}
        />
      </div>

      {/* Канал записи: список из справочника (0041), по умолчанию «Пляжи»,
          любой свой — через «Другой…». */}
      <ChannelField
        className={inputClass}
        channels={channels}
        defaultValue={prefill?.channel}
      />

      <div>
        <label htmlFor="serviceId" className="mb-1 block text-sm font-medium">
          Услуга *
        </label>
        <select
          id="serviceId"
          name="serviceId"
          required
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
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

      {/* Дата занятия. По умолчанию сегодня — это главный сценарий, «оформить
          человека на пляже сразу после занятия». Но менять её можно в пределах
          недели в обе стороны: забыл записать вчерашнего клиента, или клиент
          заплатил сегодня, а катается завтра (пачка №10, п.2). Границы считаем
          от серверной даты — см. lib/recordDate. */}
      <div>
        <label htmlFor="date" className="mb-1 block text-sm font-medium">
          Дата занятия *
        </label>
        <input
          id="date"
          name="date"
          type="date"
          required
          defaultValue={today}
          min={min}
          max={max}
          className={`${NATIVE_PICKER} ${inputClass}`}
        />
        <p className="mt-1 text-xs text-muted">
          По умолчанию сегодня. Можно сдвинуть на неделю в любую сторону —
          дальше запись оформляет админ.
        </p>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center rounded-full bg-accent px-7 py-4 text-base font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
      >
        {pending && <Spinner className="inline-flex items-center justify-center gap-2 h-4 w-4" />}
        {pending ? "Записываем…" : "Записать"}
      </button>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
