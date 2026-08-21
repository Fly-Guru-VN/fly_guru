"use client";

import { useActionState } from "react";
import { createAgentAction } from "../actions";
import { Spinner } from "@/components/Spinner";
import { AGENT_PLANS, DEFAULT_AGENT_PLAN, type AgentPlan } from "@/lib/agentTerms";

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

      {/* Условия агента (0046). По умолчанию — стандартные школьные; личные
          проценты выбираем только тем, с кем начальник договорился отдельно.
          Поменять их можно и потом, в карточке агента. */}
      <label className="block text-xs text-muted">
        Условия
        <select name="termsPlan" defaultValue={DEFAULT_AGENT_PLAN} className={`mt-1 ${inputClass}`}>
          {(Object.keys(AGENT_PLANS) as AgentPlan[]).map((key) => (
            <option key={key} value={key}>
              {AGENT_PLANS[key].label}
            </option>
          ))}
        </select>
      </label>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
      >
        {pending && <Spinner />}
        {pending ? "Создаём…" : "Создать агента"}
      </button>
    </form>
  );
}
