"use client";

import { useActionState } from "react";
import { CATEGORY_LABELS } from "@/content/services";
import { createServiceAction } from "../actions";
import { Spinner } from "@/components/Spinner";

// Форма «новая услуга»: клиентский компонент ради ошибки валидации без
// перезагрузки (useActionState). Категория выбирается один раз — потом её
// не поменять (от категории зависит логика форм и статистики).

const inputClass =
  "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary";

export function ServiceCreateForm() {
  const [state, formAction, pending] = useActionState(createServiceAction, {
    error: null,
  });

  return (
    <form action={formAction} className="space-y-3">
      <label className="block text-xs text-muted">
        Название
        <input type="text" name="name" required className={`mt-1 ${inputClass}`} />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-muted">
          Категория
          <select name="category" required defaultValue="" className={`mt-1 ${inputClass}`}>
            <option value="" disabled>
              — выбрать —
            </option>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted">
          Длительность, мин
          <input
            type="number"
            name="duration"
            min={1}
            placeholder="—"
            className={`mt-1 ${inputClass}`}
          />
        </label>
      </div>

      <label className="block text-xs text-muted">
        Цена, ₫
        <input
          type="text"
          name="price"
          inputMode="numeric"
          placeholder="пусто = по запросу"
          className={`mt-1 ${inputClass}`}
        />
      </label>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
      >
        {pending && <Spinner />}
        {pending ? "Создаём…" : "Создать услугу"}
      </button>
    </form>
  );
}
