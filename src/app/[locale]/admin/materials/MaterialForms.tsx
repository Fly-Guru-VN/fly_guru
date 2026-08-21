"use client";

import { useActionState } from "react";
import { createMaterialAction, updateMaterialAction } from "../actions";
import { Spinner } from "@/components/Spinner";

// Формы каналов: клиентские компоненты ради ошибок валидации без перезагрузки
// (useActionState) — метка может оказаться занятой или с недопустимыми знаками.

const inputClass =
  "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary";

function MaterialFields({
  defaults,
}: {
  defaults?: { label: string; hint: string | null; src: string };
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-muted">
          Название
          <input
            type="text"
            name="label"
            required
            defaultValue={defaults?.label}
            placeholder="Баннер на пляже"
            className={`mt-1 ${inputClass}`}
          />
        </label>
        <label className="text-xs text-muted">
          Метка в ссылке (?src=)
          <input
            type="text"
            name="src"
            required
            defaultValue={defaults?.src}
            placeholder="beach-banner"
            pattern="[a-zA-Z0-9_-]{2,30}"
            title="Латиница, цифры, дефис — 2–30 символов"
            className={`mt-1 ${inputClass}`}
          />
        </label>
      </div>
      <label className="mt-2 block text-xs text-muted">
        Подсказка, где использовать
        <input
          type="text"
          name="hint"
          defaultValue={defaults?.hint ?? ""}
          placeholder="QR на стойке у входа"
          className={`mt-1 ${inputClass}`}
        />
      </label>
    </>
  );
}

export function MaterialCreateForm() {
  const [state, formAction, pending] = useActionState(createMaterialAction, {
    error: null,
  });

  return (
    <form action={formAction}>
      <MaterialFields />
      {state.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 mt-3 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
      >
        {pending && <Spinner />}
        {pending ? "Создаём…" : "Добавить канал"}
      </button>
    </form>
  );
}

export function MaterialEditForm({
  material,
}: {
  material: { id: string; label: string; hint: string | null; src: string };
}) {
  const [state, formAction, pending] = useActionState(updateMaterialAction, {
    error: null,
  });

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={material.id} />
      <MaterialFields defaults={material} />
      {state.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 mt-3 rounded-full border border-line px-4 py-2 text-xs font-semibold text-muted transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
      >
        {pending && <Spinner />}
        {pending ? "Сохраняем…" : "Сохранить"}
      </button>
    </form>
  );
}
