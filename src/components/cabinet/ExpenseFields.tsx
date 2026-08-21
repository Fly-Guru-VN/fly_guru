"use client";

import { useActionState } from "react";
import type { DictItem } from "@/lib/dictionaries";
import type { ActionState } from "@/app/[locale]/instructor/actions";
import { Spinner } from "@/components/Spinner";

// Форма ручного расхода. Одна на два кабинета (пак A): админ вносит траты
// школы, инструктор — свои. Отличается только экшен, поэтому он приходит
// пропсом, а не импортируется — иначе пришлось бы держать две почти
// одинаковые формы и чинить их парой.
//
// Клиентский компонент ради ошибки валидации без перезагрузки (сумма
// обязательна). Дата по умолчанию — сегодня, приходит с сервера, чтобы
// совпадала с часовым поясом школы.

// Единая высота h-10 у всех полей формы — иначе нативный <input type="date">
// рендерится другой высоты, чем текстовые поля/селекты, и строка «дата+сумма»
// стоит на разных уровнях.
const fieldBase =
  "h-10 rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-primary";
// Категория/комментарий — на всю ширину; дата/сумма задают ширину сами.
const inputClass = `w-full ${fieldBase}`;

export function ExpenseFields({
  action,
  today,
  categories,
  submitLabel = "Добавить расход",
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  today: string;
  categories: DictItem[];
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });

  return (
    <form action={formAction}>
      {/* Дата (компактная, как в статистике) и Сумма (прежней ширины) стоят
          рядом, выровнены влево как остальные поля панели, одной высоты. Без
          w-full, иначе нативный датапикер растягивается и налезает на сумму. */}
      <div className="flex items-end gap-2">
        <label className="flex flex-col items-start text-xs text-muted">
          Дата
          <input
            type="date"
            name="date"
            defaultValue={today}
            className={`mt-1 ${fieldBase}`}
          />
        </label>
        <label className="flex flex-col items-start text-xs text-muted">
          Сумма, ₫
          <input
            type="text"
            name="amount"
            inputMode="numeric"
            required
            placeholder="1 500 000"
            className={`mt-1 w-44 ${fieldBase}`}
          />
        </label>
      </div>
      <label className="mt-2 block text-xs text-muted">
        Категория
        <select name="categoryId" className={`mt-1 ${inputClass}`}>
          <option value="">Без категории</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {categories.length === 0 && (
        <p className="mt-1 text-xs text-muted">
          Справочник категорий пуст — админ заводит их в Настройках.
        </p>
      )}
      <label className="mt-2 block text-xs text-muted">
        Комментарий
        <input
          type="text"
          name="comment"
          placeholder="Необязательно"
          className={`mt-1 ${inputClass}`}
        />
      </label>
      {state.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 mt-3 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
      >
        {pending && <Spinner />}
        {pending ? "Добавляем…" : submitLabel}
      </button>
    </form>
  );
}
