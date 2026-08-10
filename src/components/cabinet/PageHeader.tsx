// Шапка раздела: заголовок слева, действие справа, пояснение — под ними.
//
// Зачем отдельным компонентом (10.08.2026): у каждой вкладки админки заголовок
// был свой — где-то h1 с подписью в две строки, где-то с кнопкой рядом, где-то
// с бейджем внутри заголовка. На глаз это читалось как разные экраны разных
// систем, и взгляд каждый раз заново искал, где он находится.
//
// Пояснение к разделу (hint) намеренно необязательное и стоит под заголовком
// мелким: длинные инструкции в админке дочитывают один раз, а место они
// занимают всегда. Что не влезает в одну строку — прячется в <details>
// «Как это работает» на самой странице.

export function PageHeader({
  title,
  hint,
  badge,
  action,
}: {
  title: string;
  hint?: React.ReactNode;
  /** Красный счётчик у заголовка (новые заявки). */
  badge?: number;
  /** Кнопка или ссылка в правом краю строки заголовка. */
  action?: React.ReactNode;
}) {
  return (
    <div className="border-b border-line/70 pb-3">
      <div className="flex items-center justify-between gap-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          {title}
          {badge != null && badge > 0 && (
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
              {badge}
            </span>
          )}
        </h1>
        {action}
      </div>
      {hint && (
        <p className="mt-1 text-sm text-muted first-letter:uppercase">{hint}</p>
      )}
    </div>
  );
}
