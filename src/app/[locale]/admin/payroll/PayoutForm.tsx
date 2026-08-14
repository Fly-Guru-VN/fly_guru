"use client";

import { useActionState, useState } from "react";
import { paySalaryAction } from "../actions";
import type { Payee } from "@/lib/payroll";
import { vnd } from "@/lib/stats";
import { NATIVE_PICKER } from "@/components/cabinet/fieldClasses";
import { Spinner } from "@/components/Spinner";

// Главный блок вкладки: выбрал работника — вписал сумму — поставил дату —
// «Выплачено». Клиентский, потому что при выборе человека сумма подставляется
// сама («осталось отдать»), но остаётся полем ввода: отдал часть — правишь
// цифру руками, а не подгоняешь под неё период, как было раньше.

const field =
  "mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-base outline-none focus:border-primary";

export function PayoutForm({
  payees,
  today,
}: {
  payees: Payee[];
  today: string;
}) {
  const [state, formAction, pending] = useActionState(paySalaryAction, {
    error: null,
  });
  const [payee, setPayee] = useState("");
  const [amount, setAmount] = useState("");
  // Записывать ли выдачу расходом школы — см. Payee.expenseByDefault.
  const [asExpense, setAsExpense] = useState(false);

  const groups = [...new Set(payees.map((p) => p.group))];
  const chosen = payees.find((p) => `${p.kind}:${p.id}` === payee);

  // Подставляем остаток, но только пока начальник не начал править сумму сам:
  // перевыбрал человека — увидел его цифру, дописал своё — оно и осталось.
  const pick = (value: string) => {
    setPayee(value);
    const next = payees.find((p) => `${p.kind}:${p.id}` === value);
    setAmount(next && next.suggested > 0 ? String(next.suggested) : "");
    setAsExpense(next?.expenseByDefault ?? false);
  };

  return (
    <form action={formAction} className="mt-3 space-y-3">
      <label className="block text-sm font-semibold">
        Работник
        <select
          name="payee"
          value={payee}
          onChange={(e) => pick(e.target.value)}
          required
          className={field}
        >
          <option value="">Выберите…</option>
          {groups.map((group) => (
            <optgroup key={group} label={group}>
              {payees
                .filter((p) => p.group === group)
                .map((p) => (
                  <option key={`${p.kind}:${p.id}`} value={`${p.kind}:${p.id}`}>
                    {p.name}
                    {p.suggested > 0 ? ` · осталось ${vnd(p.suggested)}` : ""}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-semibold">
          Сумма, ₫
          <input
            name="amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="numeric"
            placeholder="2 000 000"
            required
            className={field}
          />
        </label>
        <label className="block text-sm font-semibold">
          Дата выплаты
          <input
            type="date"
            name="paidOn"
            defaultValue={today}
            required
            className={`${field} ${NATIVE_PICKER}`}
          />
        </label>
      </div>

      <label className="block text-sm font-semibold">
        Комментарий
        <input
          name="comment"
          placeholder="аванс · за прошлую неделю · остаток"
          className={field}
        />
      </label>

      {/* Развилка «за что платим». Она решает судьбу цифры прибыли, поэтому
          стоит прямо в форме, а не в настройках: заработанную долю списывать
          расходом нельзя (она уже вычтена в день занятия), а фикс — обязательно
          нужно, иначе прибыль окажется выше настоящей на всю выданную сумму. */}
      {chosen && (
        <fieldset className="rounded-xl border border-line p-3">
          <legend className="px-1 text-sm font-semibold">За что платим</legend>
          <label className="flex gap-2 text-sm">
            <input
              type="radio"
              name="asExpense"
              value="0"
              checked={!asExpense}
              onChange={() => setAsExpense(false)}
              className="mt-1 h-4 w-4 accent-primary"
            />
            <span>
              <span className="font-semibold">Из начисленного</span>
              <span className="block text-xs text-muted">
                Доля инструктора, комиссия агента, 1% с оборота. Эти деньги уже
                посчитаны расходом в день занятия — второй раз списывать нельзя.
              </span>
            </span>
          </label>
          <label className="mt-2 flex gap-2 text-sm">
            <input
              type="radio"
              name="asExpense"
              value="1"
              checked={asExpense}
              onChange={() => setAsExpense(true)}
              className="mt-1 h-4 w-4 accent-primary"
            />
            <span>
              <span className="font-semibold">Отдельная зарплата</span>
              <span className="block text-xs text-muted">
                Фикс СММщика, зарплата механика, своя зарплата. Нигде не
                начисляется — запишем расходом школы за день выдачи.
              </span>
            </span>
          </label>
        </fieldset>
      )}

      {chosen && chosen.suggested > 0 && (
        <p className="text-xs text-muted">
          {chosen.name}: за выбранный период осталось отдать{" "}
          {vnd(chosen.suggested)}.
        </p>
      )}

      {state.error && (
        <p className="text-sm font-semibold text-red-600">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-base font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60 sm:w-auto sm:px-8"
      >
        {pending && <Spinner />}
        Выплачено
      </button>
    </form>
  );
}
