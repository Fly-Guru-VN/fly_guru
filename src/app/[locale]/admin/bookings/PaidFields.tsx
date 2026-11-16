"use client";

import { useState } from "react";
import { NATIVE_PICKER } from "@/components/cabinet/fieldClasses";

// Блок оплаты в заявке: галочка «Клиент уже оплатил» и поля, которые нужны
// только при ней, — чем оплатил и когда. Общий для формы новой заявки и
// карточки заявки (16.11.2026).
//
// Раньше это были три поля для всех, хотя дата оплаты за всю историю
// заполнялась один раз. Неоплаченным способ спросит «Записать клиента», когда
// заявку доведут до занятия (там он обязателен).
//
// Как это ведёт себя на сервере (bookingFields в ../actions.ts):
// • галочка снята — уходят пустые paymentMethodId и paidOn, отметки об оплате
//   стираются целиком;
// • showMethod — у закрытой заявки способ проставило занятие, и править его
//   нужно и без галочки, поэтому список виден всегда и пустым не уходит.

const inputClass =
  "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary";

export function PaidFields({
  paymentMethods,
  defaultPaid = false,
  defaultMethodId = null,
  defaultMethodName = null,
  defaultPaidOn = null,
  showMethod = false,
}: {
  paymentMethods: { id: string; name: string }[];
  defaultPaid?: boolean;
  defaultMethodId?: string | null;
  /** Имя сохранённого способа: он мог пропасть из справочника. */
  defaultMethodName?: string | null;
  defaultPaidOn?: string | null;
  /** Показывать «Чем оплатил» и без галочки (закрытая заявка). */
  showMethod?: boolean;
}) {
  const [paid, setPaid] = useState(defaultPaid);
  const methodVisible = paid || showMethod;

  return (
    <>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="paidMark"
          checked={paid}
          onChange={(e) => setPaid(e.target.checked)}
          className="h-4 w-4 accent-primary"
        />
        Клиент уже оплатил
      </label>

      {/* Снятый чекбокс браузер не отправляет вовсе, и сервер считал, что
          отметку не трогали: снять «уже оплатил» в карточке было нельзя. Явное
          «off» говорит серверу «не платил». */}
      {!paid && <input type="hidden" name="paidMark" value="off" />}
      {/* Скрытые поля уходят пустыми: снятая галочка означает «не платил», и
          способ с датой от прежней отметки не должны остаться висеть. */}
      {!methodVisible && <input type="hidden" name="paymentMethodId" value="" />}
      {!paid && <input type="hidden" name="paidOn" value="" />}

      {methodVisible && (
        <div className="grid grid-cols-2 items-end gap-2">
          <label className="min-w-0 text-xs text-muted">
            Чем оплатил
            <select
              name="paymentMethodId"
              defaultValue={defaultMethodId ?? ""}
              className={`mt-1 ${inputClass}`}
            >
              <option value="">— не указано —</option>
              {paymentMethods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              {/* Способ мог быть скрыт в справочнике уже после оплаты — иначе
                  select не нашёл бы своё значение и сохранение затёрло бы его. */}
              {defaultMethodId && !paymentMethods.some((p) => p.id === defaultMethodId) && (
                <option value={defaultMethodId}>{defaultMethodName ?? "прежний способ"}</option>
              )}
            </select>
          </label>
          {/* Когда именно заплатил (0042). Пусто — в день занятия. Заполняют,
              когда деньги пришли раньше, иногда в прошлом месяце: дата
              переедет в занятие, и чек ляжет в кассу того месяца. */}
          {paid && (
            <label className="min-w-0 text-xs text-muted">
              Дата оплаты, если не в день занятия
              <input
                type="date"
                name="paidOn"
                defaultValue={defaultPaidOn ?? ""}
                className={`mt-1 ${NATIVE_PICKER} ${inputClass}`}
              />
            </label>
          )}
        </div>
      )}
    </>
  );
}
