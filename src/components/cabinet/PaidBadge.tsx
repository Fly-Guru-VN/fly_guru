// «Оплачен» / «Не оплачен» у абонемента — одинаково во всех кабинетах.
//
// Инструктору это нужно не из любопытства: он списывает минуты и продаёт
// абонементы, а деньги за них принимает не всегда сам. Раньше отметку оплаты
// видел только админ, и инструктор списывал минуты, не зная, заплатил клиент
// или нет (пачка №9, пак 4, п.3).
export function PaidBadge({
  paidAt,
  className = "",
}: {
  paidAt: string | null;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-bold ${
        paidAt
          ? "bg-emerald-500/10 text-emerald-600"
          : "bg-amber-500/10 text-amber-600"
      } ${className}`}
    >
      <span aria-hidden>{paidAt ? "✓" : "!"}</span>
      {paidAt ? "Оплачен" : "Не оплачен"}
    </span>
  );
}
