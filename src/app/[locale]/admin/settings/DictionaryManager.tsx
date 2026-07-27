"use client";

import { useActionState } from "react";
import { addDictItemAction, toggleDictItemAction } from "../actions";
import type { DictItem, DictTable } from "@/lib/dictionaries";
import { Spinner } from "@/components/Spinner";

// Управление справочником (категории расходов / форматы оплаты) — пак A.
// Клиентский компонент ради ошибки под полем без перезагрузки («уже есть»).
// Скрытые позиции показываем блёклыми и с кнопкой «Вернуть»: админ должен
// видеть, что позиция существует, иначе он попробует завести её заново и
// упрётся в «уже есть» без объяснений.

const inputClass =
  "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary";

export function DictionaryManager({
  table,
  title,
  hint,
  placeholder,
  items,
}: {
  table: DictTable;
  title: string;
  hint: string;
  placeholder: string;
  items: DictItem[];
}) {
  const [state, formAction, pending] = useActionState(addDictItemAction, {
    error: null,
  });

  const active = items.filter((i) => i.active);
  const hidden = items.filter((i) => !i.active);

  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="font-bold">{title}</h2>
      <p className="mt-1 text-xs text-muted">{hint}</p>

      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Пока пусто — добавьте первую позицию.</p>
      ) : (
        <ul className="mt-3 space-y-1">
          {[...active, ...hidden].map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 odd:bg-line/20"
            >
              <span
                className={`min-w-0 truncate text-sm ${
                  item.active ? "font-semibold" : "text-muted line-through"
                }`}
              >
                {item.name}
              </span>
              <form action={toggleDictItemAction} className="shrink-0">
                <input type="hidden" name="table" value={table} />
                <input type="hidden" name="id" value={item.id} />
                <input
                  type="hidden"
                  name="active"
                  value={item.active ? "false" : "true"}
                />
                <button
                  type="submit"
                  className="text-xs font-semibold text-muted transition-colors hover:text-primary"
                >
                  {item.active ? "Скрыть" : "Вернуть"}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={formAction} className="mt-4 border-t border-line pt-4">
        <input type="hidden" name="table" value={table} />
        <div className="flex items-start gap-2">
          <label className="min-w-0 flex-1 text-xs text-muted">
            Новая позиция
            <input
              type="text"
              name="name"
              required
              placeholder={placeholder}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center justify-center gap-2 mt-[1.15rem] shrink-0 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
          >
            {pending ? <Spinner className="h-4 w-4" /> : "Добавить"}
          </button>
        </div>
        {state.error && (
          <p className="mt-2 text-sm text-red-600">{state.error}</p>
        )}
      </form>
    </section>
  );
}
