"use client";

import { useActionState, useState } from "react";
import { writeOffAction, type ActionState } from "../actions";
import { RIDERS_MAX } from "@/lib/riders";
import { Spinner } from "@/components/Spinner";

const inputClass =
  "w-full rounded-xl border border-line bg-surface px-4 py-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

export function WriteOffForm({
  clientId,
  clientName,
  left,
}: {
  clientId: string;
  clientName: string;
  left: number;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    writeOffAction,
    { error: null },
  );

  // Длительность каталки и число катавшихся одновременно держим в состоянии
  // ради подсказки «спишется 60 мин»: с абонемента уходит длительность ×
  // райдеров, и без этой строки инструктор видит на экране 30, а в истории
  // потом 60 — и думает, что программа сама себе накинула.
  const [duration, setDuration] = useState("");
  const [riders, setRiders] = useState(1);

  const parsed = Math.floor(Number(duration));
  const total = Number.isFinite(parsed) && parsed > 0 ? parsed * riders : 0;
  const tooMuch = total > left;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="clientName" value={clientName} />

      <div>
        <label htmlFor="minutes" className="mb-1 block text-sm font-medium">
          Минут каталки{" "}
          <span className="font-normal text-muted">— на одного</span>
        </label>
        <input
          id="minutes"
          name="minutes"
          type="number"
          inputMode="numeric"
          min={1}
          max={left}
          step={1}
          required
          placeholder="30"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          className={`${inputClass} text-2xl font-bold`}
        />
      </div>

      {/* Сколько человек каталось одновременно с этого абонемента. Кнопками, а
          не полем ввода: экран инструктора — телефон, а вариантов всего
          несколько, и в них надо попадать пальцем не глядя. */}
      <div>
        <span className="mb-1 block text-sm font-medium">
          Сколько катались{" "}
          <span className="font-normal text-muted">— одновременно</span>
        </span>
        <input type="hidden" name="riders" value={riders} />
        <div className="flex gap-2">
          {Array.from({ length: RIDERS_MAX }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRiders(n)}
              aria-pressed={riders === n}
              className={`flex-1 rounded-xl border py-3 text-base font-semibold transition-colors ${
                riders === n
                  ? "border-accent bg-accent text-white"
                  : "border-line bg-surface text-muted"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Итог показываем только когда он не равен введённому числу: при одном
          райдере строка «спишется 30 мин» — лишний шум под полем с цифрой 30. */}
      {riders > 1 && total > 0 && (
        <p className={`text-sm ${tooMuch ? "text-red-600" : "text-muted"}`}>
          Спишется <b>{total} мин</b> ({parsed} × {riders}). Остаток {left} мин.
        </p>
      )}

      <div>
        <label htmlFor="comment" className="mb-1 block text-sm font-medium">
          Комментарий{" "}
          <span className="font-normal text-muted">— если есть что добавить</span>
        </label>
        <input
          id="comment"
          name="comment"
          type="text"
          placeholder="малое крыло, ветер…"
          className={inputClass}
        />
      </div>

      <button
        type="submit"
        disabled={pending || left <= 0 || tooMuch}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-7 py-4 text-base font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
      >
        {pending && <Spinner />}
        {pending ? "Списываем…" : "Списать минуты"}
      </button>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
