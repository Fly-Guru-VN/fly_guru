"use client";

import { useActionState } from "react";
import { addEquipmentAction, toggleEquipmentAction } from "../actions";
import type { EquipmentItem, EquipmentKind } from "@/lib/equipment";
import { Spinner } from "@/components/Spinner";

// Управление инвентарём (пак C): один блок на вид — «Доски» или «Крылья».
// Как DictionaryManager, но с привязкой к kind. Скрытые единицы показываем
// блёклыми с кнопкой «Вернуть»: админ должен видеть, что доска существует,
// иначе заведёт её заново и упрётся в «уже есть».

const inputClass =
  "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary";

export function EquipmentManager({
  kind,
  title,
  hint,
  placeholder,
  items,
}: {
  kind: EquipmentKind;
  title: string;
  hint: string;
  placeholder: string;
  items: EquipmentItem[];
}) {
  const [state, formAction, pending] = useActionState(addEquipmentAction, {
    error: null,
  });

  const mine = items.filter((i) => i.kind === kind);
  const active = mine.filter((i) => i.active);
  const hidden = mine.filter((i) => !i.active);

  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="font-bold">{title}</h2>
      <p className="mt-1 text-xs text-muted">{hint}</p>

      {mine.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Пока пусто — добавьте первую единицу.</p>
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
              <form action={toggleEquipmentAction} className="shrink-0">
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
        <input type="hidden" name="kind" value={kind} />
        <div className="flex items-start gap-2">
          <label className="min-w-0 flex-1 text-xs text-muted">
            Новая единица
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
        {state.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
      </form>
    </section>
  );
}
