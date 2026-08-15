"use client";

import { vnd } from "@/lib/stats";

// Кнопка «Выплатить» в карточке человека: заполняет форму наверху страницы —
// работник и сумма, заработанная за ВЫБРАННЫЙ период. Ровно старый сценарий
// («выбрал неделю → нажал выплачено у каждого»), только сумма теперь попадает в
// поле, а не записывается сама: отдал часть — правишь цифру перед отправкой.
//
// Связь через событие окна, а не через общее состояние: карточки рисует сервер
// (они внутри серверного компонента страницы), и поднимать ради одной кнопки
// весь список в клиент незачем.

export const PAYOUT_EVENT = "flyguru:payout";

export interface PayoutRequest {
  payee: string; // «staff:<id>» или «agent:<id>» — как в поле формы
  amount: number;
}

// warn — за этот период человеку уже отдали столько же или выдавать ему больше
// нечего. Кнопку не убираем (аванс и доплату никто не запрещал), но красим
// красным: без этого чип «Всё выдано» и приглашение «Выплатить 987 500 ₫»
// стоят рядом и читаются как «надо выдать ещё раз».
export function PayButton({
  payee,
  amount,
  warn = false,
}: PayoutRequest & { warn?: boolean }) {
  return (
    <button
      type="button"
      title={
        warn
          ? "За этот период уже выплачено — второй раз платить не нужно"
          : undefined
      }
      onClick={() =>
        window.dispatchEvent(
          new CustomEvent<PayoutRequest>(PAYOUT_EVENT, {
            detail: { payee, amount: Math.round(amount) },
          }),
        )
      }
      className={`w-full shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors sm:w-auto ${
        warn
          ? "border-red-500 text-red-600 hover:bg-red-500 hover:text-white"
          : "border-primary text-primary hover:bg-primary hover:text-white"
      }`}
    >
      {/* «ещё» — чтобы красная кнопка рядом с зелёным «Всё выдано» читалась как
          «можно, но не нужно», а не как противоречие. */}
      {warn ? "Выплатить ещё " : "Выплатить "}
      {vnd(amount)}
    </button>
  );
}
