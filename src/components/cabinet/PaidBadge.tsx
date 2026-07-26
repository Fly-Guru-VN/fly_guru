import { PAYMENT_CLAIM_BADGE, type PaymentClaim } from "@/lib/paymentClaim";

// «Оплачен» / «Не оплачен» у абонемента — одинаково во всех кабинетах.
//
// Инструктору это нужно не из любопытства: он списывает минуты и продаёт
// абонементы, а деньги за них принимает не всегда сам. Раньше отметку оплаты
// видел только админ, и инструктор списывал минуты, не зная, заплатил клиент
// или нет (пачка №9, пак 4, п.3).
//
// Третье состояние — заявление об оплате (пачка №10, п.5): деньги, по словам
// инструктора, уже у школы, но админ этого ещё не подтвердил. Показываем именно
// его, а не глухое «Не оплачен»: иначе тот же вопрос будут задавать по кругу.
export function PaidBadge({
  paidAt,
  claim = null,
  className = "",
}: {
  paidAt: string | null;
  claim?: PaymentClaim | null;
  className?: string;
}) {
  const pending = !paidAt && claim !== null;
  const label = paidAt
    ? "Оплачен"
    : pending
      ? PAYMENT_CLAIM_BADGE[claim!]
      : "Не оплачен";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-bold ${
        paidAt
          ? "bg-emerald-500/10 text-emerald-600"
          : "bg-amber-500/10 text-amber-600"
      } ${className}`}
    >
      <span aria-hidden>{paidAt ? "✓" : pending ? "⏳" : "!"}</span>
      {label}
    </span>
  );
}
