"use client";

import { useActionState, useState } from "react";
import {
  adminSellSubscriptionAction,
  writeOffMinutesAction,
} from "../actions";
import { PaymentMethodField } from "@/components/cabinet/PaymentMethodField";
import { NATIVE_PICKER } from "@/components/cabinet/fieldClasses";
import { Spinner } from "@/components/Spinner";

// Клиентские кусочки страницы абонементов: две формы с ошибками без
// перезагрузки (useActionState). Кнопка с confirm() — в ../ConfirmSubmit.

export interface Option {
  id: string;
  name: string;
}
export interface ClientOption extends Option {
  phone: string | null;
}

const inputClass =
  "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary";

// Продажа абонемента админом: клиент из списка или новый, продавец (его
// комиссия), цена (пусто = 6 млн по умолчанию), дата продажи, отметка оплаты.
// Префилл из заявки на абонемент: контакты клиента + id заявки, которую
// продажа должна закрыть. Если у заявки уже привязан clientId — используем его.
export interface SubscriptionPrefill {
  bookingId: string;
  name: string;
  phone: string;
  telegram: string | null;
  clientId: string | null;
  paymentMethodId?: string | null; // способ оплаты из карточки заявки
  paymentMethodName?: string | null;
}

export function SellSubscriptionForm({
  clients,
  staff,
  today,
  paymentMethods,
  prefill,
}: {
  clients: ClientOption[];
  staff: Option[];
  today: string;
  paymentMethods: Option[];
  prefill?: SubscriptionPrefill;
}) {
  const [state, formAction, pending] = useActionState(adminSellSubscriptionAction, {
    error: null,
  });
  const [clientId, setClientId] = useState(prefill?.clientId ?? "");
  // Способ оплаты спрашиваем только когда деньги уже получены: при продаже
  // «в долг» он ещё неизвестен, и заставлять выбирать наугад — врать отчёту.
  const [paid, setPaid] = useState(false);
  // Дата продажи в состоянии, потому что от неё зависит дата оплаты: чаще
  // всего платят в день покупки, и подставлять сюда «сегодня» было бы неверно
  // для абонемента, внесённого задним числом.
  const [soldDate, setSoldDate] = useState(today);

  return (
    <form action={formAction} className="space-y-3">
      {prefill && <input type="hidden" name="bookingId" value={prefill.bookingId} />}
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
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-muted">
              Имя нового клиента *
              <input
                type="text"
                name="newName"
                required
                defaultValue={prefill?.name ?? ""}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="text-xs text-muted">
              Телефон *
              <input
                type="tel"
                name="newPhone"
                required
                defaultValue={prefill?.phone ?? ""}
                className={`mt-1 ${inputClass}`}
              />
            </label>
          </div>
          {prefill?.telegram && (
            <input type="hidden" name="telegramUsername" value={prefill.telegram} />
          )}
        </>
      )}

      {/* items-end: подпись «Продал (15% …)» на телефоне переносится на вторую
          строку, и без выравнивания поля разъезжаются по вертикали. */}
      <div className="grid grid-cols-2 items-end gap-2">
        <label className="min-w-0 text-xs text-muted">
          Продал (15% в общий котёл после оплаты)
          <select name="sellerId" className={`mt-1 ${inputClass}`}>
            {staff.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0 text-xs text-muted">
          Дата продажи
          <input
            type="date"
            name="soldDate"
            value={soldDate}
            onChange={(e) => setSoldDate(e.target.value)}
            max={today}
            required
            className={`mt-1 ${NATIVE_PICKER} ${inputClass}`}
          />
        </label>
      </div>

      <div className="flex items-end gap-3">
        <label className="flex-1 text-xs text-muted">
          Цена, ₫
          <input
            type="text"
            name="price"
            inputMode="numeric"
            placeholder="по умолчанию 6 000 000"
            className={`mt-1 ${inputClass}`}
          />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            name="paid"
            checked={paid}
            onChange={(e) => setPaid(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          Оплата получена
        </label>
      </div>

      {paid && (
        <div className="space-y-3">
          {/* Дата оплаты отдельно от даты продажи: человек мог купить абонемент
              в конце июля, а деньги принести в августе. От даты оплаты зависит,
              в чью выручку и в чей котёл 15% попадёт абонемент, — раньше она
              жёстко равнялась дате продажи, и такие случаи уезжали в чужой
              месяц. По умолчанию совпадает с продажей: так платят почти всегда. */}
          <label className="block text-xs text-muted sm:w-1/2">
            Дата оплаты
            <input
              type="date"
              name="paidDate"
              // key: без него React не обновит defaultValue при смене даты
              // продажи — поле так и осталось бы с первым значением.
              key={soldDate}
              defaultValue={soldDate}
              max={today}
              required
              className={`mt-1 ${NATIVE_PICKER} ${inputClass}`}
            />
          </label>
          {/* Из заявки способ приезжает уже выбранным — он проставлен в её карточке. */}
          <PaymentMethodField
            methods={paymentMethods}
            selectedId={prefill?.paymentMethodId}
            selectedName={prefill?.paymentMethodName}
            className={`mt-1 ${inputClass}`}
            variant="compact"
          />
        </div>
      )}

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
      >
        {pending && <Spinner className="inline-flex items-center justify-center gap-2 h-4 w-4" />}
        {pending ? "Сохраняем…" : "Продать абонемент"}
      </button>
    </form>
  );
}

// Прокат по абонементу: клиент откатал минуты в конкретный день. Пишется
// сессией (без денег), поэтому человек виден в «Сессиях» этого дня — в отличие
// от корректировки ниже, которая живёт только в истории абонемента.
export function WriteOffMinutesForm({
  subscriptionId,
  staff,
  today,
}: {
  subscriptionId: string;
  staff: Option[];
  today: string;
}) {
  const [state, formAction, pending] = useActionState(writeOffMinutesAction, {
    error: null,
  });

  return (
    <form action={formAction} className="mt-3 space-y-2">
      <input type="hidden" name="subscriptionId" value={subscriptionId} />
      {/* Четыре поля в две ровные пары: минуты + дата, инструктор +
          комментарий. Раньше «Инструктор» растягивался на всю ширину и
          болтался один — места под пометку не было вовсе. */}
      <div className="grid grid-cols-2 items-end gap-2">
        <label className="min-w-0 text-xs text-muted">
          Откатал, мин
          <input
            type="number"
            name="minutes"
            min={1}
            placeholder="45"
            required
            className={`mt-1 ${inputClass}`}
          />
        </label>
        <label className="min-w-0 text-xs text-muted">
          Дата проката
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
            <option value="">— не указан —</option>
            {staff.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        {/* Необязательная пометка к прокату — уходит в примечание сессии, то
            же поле, что инструктор видит в «Сессиях». */}
        <label className="min-w-0 text-xs text-muted">
          Комментарий
          <input
            type="text"
            name="comment"
            placeholder="малое крыло, ветер…"
            className={`mt-1 ${inputClass}`}
          />
        </label>
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
      >
        {pending && <Spinner className="inline-flex items-center justify-center gap-2 h-4 w-4" />}
        {pending ? "Списываем…" : "Списать минуты"}
      </button>
    </form>
  );
}
