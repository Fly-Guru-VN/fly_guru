"use client";

import { useActionState } from "react";
import { createAgentAction } from "../actions";

// Форма «новый агент»: клиентский компонент ради ошибки валидации без
// перезагрузки (useActionState). Реф-код генерируется на сервере.

const inputClass =
  "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary";

export function AgentCreateForm() {
  const [state, formAction, pending] = useActionState(createAgentAction, {
    error: null,
  });

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-muted">
          Имя
          <input type="text" name="name" required className={`mt-1 ${inputClass}`} />
        </label>
        <label className="text-xs text-muted">
          Телефон *
          <input type="tel" name="phone" required className={`mt-1 ${inputClass}`} />
        </label>
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
      >
        {pending ? "Создаём…" : "Создать агента"}
      </button>
    </form>
  );
}
