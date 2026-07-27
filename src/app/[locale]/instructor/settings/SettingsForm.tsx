"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import { updateProfileAction, type ActionState } from "../actions";
import { PHOTO_ACCEPT } from "@/lib/photos";
import { PhotoInput } from "@/components/cabinet/PhotoInput";
import { Spinner } from "@/components/Spinner";

const inputClass =
  "w-full rounded-xl border border-line bg-surface px-4 py-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

export function SettingsForm({
  name,
  photoUrl,
  age,
  monthlyGoal,
  showGoal = true,
}: {
  name: string;
  photoUrl: string | null;
  age: number | null;
  monthlyGoal: number | null;
  // Цель по ЗП питает прогресс-бар на главном экране инструктора. У админа
  // такого экрана нет — прячем поле (форму саму переиспользуем как есть).
  showGoal?: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateProfileAction,
    { error: null },
  );

  // Локальный предпросмотр выбранного фото (до отправки на сервер). Показываем
  // уже сжатый кадр — ровно то, что уйдёт на сервер.
  //
  // Ручной проверки «больше 4 МБ» здесь больше нет: PhotoInput пережимает кадр
  // в браузере, и снимок с айфона перестал отбиваться (пачка №10, п.1).
  const [preview, setPreview] = useState<string | null>(null);

  function onPhotoPicked(file: File | null) {
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  return (
    <form action={formAction} className="space-y-4">
      {/* Фото: кружок-предпросмотр + нативный выбор файла (на телефоне
          откроет галерею/камеру) */}
      <div className="flex items-center gap-4">
        {preview ? (
          // Предпросмотр — это локальный blob:-URL, next/image с ним не работает.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Новое фото"
            className="h-18 w-18 shrink-0 rounded-full object-cover"
          />
        ) : photoUrl ? (
          <Image
            src={photoUrl}
            alt={name}
            width={72}
            height={72}
            className="h-18 w-18 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-18 w-18 shrink-0 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary">
            {name.trim().charAt(0).toUpperCase() || "?"}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <label htmlFor="photo" className="mb-1 block text-sm font-medium">
            Фото
          </label>
          <PhotoInput
            id="photo"
            name="photo"
            accept={PHOTO_ACCEPT}
            onPicked={onPhotoPicked}
            className="w-full text-sm text-muted file:mr-3 file:rounded-full file:border-0 file:bg-primary/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary"
          />
        </div>
      </div>

      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-medium">
          Отображаемое имя *
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={name}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="age" className="mb-1 block text-sm font-medium">
          Возраст
        </label>
        <input
          id="age"
          name="age"
          type="number"
          inputMode="numeric"
          min={14}
          max={99}
          defaultValue={age ?? ""}
          className={inputClass}
        />
      </div>

      {showGoal && (
        <div>
          <label htmlFor="monthly_goal" className="mb-1 block text-sm font-medium">
            Цель по ЗП на месяц, ₫
          </label>
          <input
            id="monthly_goal"
            name="monthly_goal"
            type="text"
            inputMode="numeric"
            placeholder="20 000 000"
            defaultValue={monthlyGoal ?? ""}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-muted">
            Пустое поле — прогресс-бар на главном экране не показывается.
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center rounded-full bg-accent px-7 py-4 text-base font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
      >
        {pending && <Spinner className="inline-flex items-center justify-center gap-2 h-4 w-4" />}
        {pending ? "Сохраняем…" : "Сохранить"}
      </button>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
