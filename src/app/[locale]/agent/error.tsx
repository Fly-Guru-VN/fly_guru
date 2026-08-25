"use client";

// Экран на случай, когда серверное действие кабинета упало (ошибка базы, сети,
// сорвавшийся запрос). Без него такой сбой уходил только в серверный лог:
// страница перерисовывалась прежней, и человек шёл дальше, считая, что всё
// сохранилось. Правило простое: не смогли записать — говорим об этом вслух.
export default function AgentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-2xl border border-red-400/60 bg-surface p-6">
      <h1 className="text-xl font-bold text-red-600">Не удалось сохранить</h1>
      <p className="mt-2 text-sm text-muted">
        Изменение <span className="font-semibold text-ink">не записано</span> в
        базу. Проверьте интернет и попробуйте ещё раз.
      </p>
      {error.digest && (
        <p className="mt-2 text-xs text-muted">Код ошибки: {error.digest}</p>
      )}
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong"
      >
        Попробовать снова
      </button>
    </div>
  );
}
