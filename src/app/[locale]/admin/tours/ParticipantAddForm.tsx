"use client";

import { useActionState } from "react";
import { addTourParticipantAction } from "../actions";
import { Spinner } from "@/components/Spinner";

// Добавить участника к уже записанному туру: имя + телефон. Есть в базе —
// привяжется существующий клиент, нет — заведётся новый.
export function ParticipantAddForm({
  sessionId,
  inputClass,
}: {
  sessionId: string;
  inputClass: string;
}) {
  const [state, formAction, pending] = useActionState(addTourParticipantAction, {
    error: null,
  });
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="sessionId" value={sessionId} />
      <div className="flex items-end gap-2">
        <label className="min-w-0 flex-1 text-xs text-muted">
          Имя
          <input type="text" name="participantName" required className={`mt-1 ${inputClass}`} />
        </label>
        <label className="min-w-0 flex-1 text-xs text-muted">
          Телефон
          <input
            type="tel"
            name="participantPhone"
            inputMode="tel"
            required
            className={`mt-1 ${inputClass}`}
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="mb-0.5 inline-flex shrink-0 items-center gap-1 rounded-full border border-line px-4 py-2 text-xs font-semibold text-muted transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
        >
          {pending && <Spinner />}
          Добавить
        </button>
      </div>
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
