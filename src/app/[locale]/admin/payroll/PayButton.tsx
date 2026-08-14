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

export function PayButton({ payee, amount }: PayoutRequest) {
  return (
    <button
      type="button"
      onClick={() =>
        window.dispatchEvent(
          new CustomEvent<PayoutRequest>(PAYOUT_EVENT, {
            detail: { payee, amount: Math.round(amount) },
          }),
        )
      }
      className="shrink-0 rounded-full border border-primary px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
    >
      Выплатить {vnd(amount)}
    </button>
  );
}
