"use client";

import { useActionState } from "react";
import { payAgentAction } from "../actions";
import type { DictItem } from "@/lib/dictionaries";
import { NATIVE_PICKER } from "@/components/cabinet/fieldClasses";
import { Spinner } from "@/components/Spinner";

// Форма «выплачено агенту» (пачка №5, п.7): сумма, способ, дата, комментарий.
// Клиентский компонент ради ошибки под кнопкой без перезагрузки (useActionState).
//
// Сумма подставляется как остаток «к выплате», но правится руками: админ может
// отдать часть сейчас, часть потом, или закрыть всё одним переводом.

const inputClass =
  "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary";

export function AgentPayoutForm({
  agentId,
  suggested,
  methods,
  today,
}: {
  agentId: string;
  suggested: number;
  methods: DictItem[];
  today: string;
}) {
  const [state, formAction, pending] = useActionState(payAgentAction, {
    error: null,
  });

  return (
    <form action={formAction} className="mt-3 space-y-2">
      <input type="hidden" name="agentId" value={agentId} />
      <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-3">
        <label className="text-xs text-muted">
          Сумма, ₫
          <input
            type="text"
            name="amount"
            inputMode="numeric"
            defaultValue={suggested > 0 ? String(suggested) : ""}
            placeholder="300 000"
            required
            className={`mt-1 ${inputClass}`}
          />
        </label>
        <label className="text-xs text-muted">
          Чем выплатил
          <select name="methodId" className={`mt-1 ${inputClass}`}>
            {methods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0 text-xs text-muted">
          Когда
          <input
            type="date"
            name="paidOn"
            defaultValue={today}
            max={today}
            required
            className={`mt-1 ${NATIVE_PICKER} ${inputClass}`}
          />
        </label>
      </div>
      <label className="block text-xs text-muted">
        Комментарий (необязательно)
        <input
          type="text"
          name="comment"
          placeholder="за июль, двумя переводами…"
          className={`mt-1 ${inputClass}`}
        />
      </label>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
      >
        {pending && <Spinner />}
        {pending ? "Сохраняем…" : "Выплачено"}
      </button>
    </form>
  );
}
