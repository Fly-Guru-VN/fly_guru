"use client";

import Image from "next/image";
import { useActionState } from "react";
import { uploadClientPhotoAction } from "../actions";
import { PHOTO_ACCEPT } from "@/lib/photos";
import { PhotoInput } from "@/components/cabinet/PhotoInput";
import { showToast } from "@/components/cabinet/Toast";
import type { ActionState } from "@/app/[locale]/instructor/actions";
import { Spinner } from "@/components/Spinner";

// Фото клиента (пак B, пункт 7). Отдельная форма от карточки: та сохраняется
// без файлов, и тащить фото через каждое сохранение заметки незачем.
//
// Один компонент на оба кабинета: в админке экшен по умолчанию, у инструктора
// (пачка №9, пак 1) — свой, с проверкой роли вместо requireAdmin. capture у
// админа не ставим намеренно: он за компьютером и выбирает готовый снимок, а
// инструктор стоит рядом с клиентом — ему открываем камеру сразу.

export function ClientPhoto({
  clientId,
  photoUrl,
  name,
  action = uploadClientPhotoAction,
  capture = false,
}: {
  clientId: string;
  photoUrl: string | null;
  name: string;
  action?: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  capture?: boolean;
}) {
  // Успех виден и по самому фото, но на телефоне карточка длинная и снимок
  // остаётся выше экрана — поэтому короткое уведомление (пачка №10, п.1).
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await action(prev, formData);
      if (!result.error) showToast("Фото загружено");
      return result;
    },
    { error: null },
  );

  return (
    <div className="flex items-start gap-3">
      {photoUrl ? (
        <Image
          src={photoUrl}
          alt={name}
          width={64}
          height={64}
          className="h-16 w-16 shrink-0 rounded-xl object-cover"
        />
      ) : (
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xl font-bold text-primary">
          {name.trim().charAt(0).toUpperCase() || "?"}
        </div>
      )}
      <form action={formAction} className="min-w-0 flex-1">
        <input type="hidden" name="id" value={clientId} />
        <label className="block text-xs text-muted">
          {photoUrl ? "Заменить фото" : "Фото клиента"}
          <PhotoInput
            name="photo"
            accept={PHOTO_ACCEPT}
            capture={capture ? "environment" : undefined}
            required
            className="mt-1 block w-full text-xs text-muted file:mr-3 file:rounded-full file:border-0 file:bg-line/50 file:px-3 file:py-1.5 file:text-xs file:font-semibold"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 mt-2 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
        >
          {pending && <Spinner />}
          {pending ? "Загружаем…" : "Загрузить"}
        </button>
        {state.error && (
          <p className="mt-1 text-xs text-red-600">{state.error}</p>
        )}
      </form>
    </div>
  );
}
