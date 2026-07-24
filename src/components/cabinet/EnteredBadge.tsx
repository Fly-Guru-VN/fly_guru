import { vnEnteredLabel } from "@/lib/dates";

// «🕒 Внесено 23.07 в 14:32» — когда запись реально появилась в базе.
//
// Зачем отдельной плашкой, а не серой строчкой в общем перечислении: дата
// занятия и момент внесения — разные вещи (сессию заводят и задним числом), и
// разбор «кто когда что записал» начинается именно с этого времени. Просили
// сделать заметным (пачка №9, пак 3) — поэтому плашка с рамкой, как у способа
// оплаты, а не мелкий серый текст, который взгляд пропускает.
export function EnteredBadge({
  at,
  className = "",
}: {
  at: string | null;
  className?: string;
}) {
  if (!at) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg border border-line bg-line/40 px-2 py-0.5 text-xs font-bold text-ink ${className}`}
    >
      <span aria-hidden>🕒</span>
      Внесено {vnEnteredLabel(at)}
    </span>
  );
}
