// Свёрнутое пояснение к разделу: «Как это работает ▾».
//
// Зачем (12.08.2026). Правила разделов жили в подписи под заголовком
// (PageHeader hint) целыми абзацами: «пока нет отметки оплаты, абонемент —
// ожидает: он не входит в выручку и комиссию продавца…». На ПК это две строки
// мелким серым, на телефоне — четыре, и они отодвигали вниз то, ради чего в
// раздел зашли. Читают такие правила один раз, а место они занимают всегда.
//
// Теперь в подписи остаётся одна строка сути, а полный текст — здесь, под
// кликом. Разметка та же, что была у «Как работать с заявкой» в ленте заявок,
// вынесена в общий компонент, чтобы одинаковые блоки не разъезжались на
// двенадцати вкладках.
export function PageNote({
  title = "Как это работает",
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer list-none text-xs font-semibold text-muted transition-colors hover:text-primary [&::-webkit-details-marker]:hidden">
        {title} ▾
      </summary>
      <div className="mt-1 space-y-1 text-sm text-muted">{children}</div>
    </details>
  );
}
