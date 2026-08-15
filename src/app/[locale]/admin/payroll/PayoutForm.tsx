"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { paySalaryAction } from "../actions";
import type { Payee } from "@/lib/payroll";
import { vnd } from "@/lib/stats";
import { NATIVE_PICKER } from "@/components/cabinet/fieldClasses";
import { Spinner } from "@/components/Spinner";
import { PAYOUT_EVENT, type PayoutRequest } from "./PayButton";

// Главный блок вкладки: выбрал работника — вписал сумму — поставил дату —
// «Выплачено». Клиентский, потому что сумма подставляется сама, но остаётся
// полем ввода: отдал часть — правишь цифру руками, а не подгоняешь под неё
// период, как было раньше.
//
// Два способа заполнить форму, и они дают РАЗНЫЕ суммы — это намеренно:
//   • выбор человека в списке подставляет всё, что ему ОСТАЛОСЬ ВЫДАТЬ (сальдо
//     с точки отсчёта);
//   • кнопка «Выплатить» в карточке — заработок за ВЫБРАННЫЙ период.
// Первый отвечает на «сколько мы ему вообще должны», второй — на «закрываем
// эту неделю». См. lib/payroll.

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
  const formRef = useRef<HTMLFormElement>(null);

  const groups = [...new Set(payees.map((p) => p.group))];
  const chosen = payees.find((p) => `${p.kind}:${p.id}` === payee);

  // Подставляем остаток, но только пока начальник не начал править сумму сам:
  // перевыбрал человека — увидел его цифру, дописал своё — оно и осталось.
  const pick = (value: string) => {
    setPayee(value);
    const next = payees.find((p) => `${p.kind}:${p.id}` === value);
    setAmount(next && next.suggested > 0 ? String(next.suggested) : "");
  };

  // Кнопка «Выплатить» из карточки: заполняем поля и подматываем к форме —
  // она наверху страницы, а список долгов длинный.
  useEffect(() => {
    const onPay = (e: Event) => {
      const { payee: who, amount: sum } = (e as CustomEvent<PayoutRequest>)
        .detail;
      setPayee(who);
      setAmount(sum > 0 ? String(sum) : "");
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    window.addEventListener(PAYOUT_EVENT, onPay);
    return () => window.removeEventListener(PAYOUT_EVENT, onPay);
  }, []);

  return (
    <form ref={formRef} action={formAction} className="mt-3 space-y-3">
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
                    {p.fired ? " · уволен" : ""}
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

      {/* Развилки «за что платим» здесь больше нет (14.08.2026). Она решала,
          заводить ли расход-двойник, — а теперь выплата и есть расход школы:
          деньги уходят из остатка в день выдачи, кому бы ни платили. */}

      {chosen && chosen.suggested > 0 && (
        <p className="text-sm text-muted">
          {chosen.name}: осталось выдать {vnd(chosen.suggested)} — это за всё
          время, а не за выбранный период.
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
