"use client";

import { useActionState } from "react";
import { PHOTO_ACCEPT } from "@/lib/photos";
import { PhotoInput } from "@/components/cabinet/PhotoInput";
import { showToast } from "@/components/cabinet/Toast";
import { Spinner } from "@/components/Spinner";
import { setStaffPhotoAction, type PhotoState } from "./actions";

// Кнопка «Сменить фото» под аватаркой в профиле. Выбрал снимок — он сжался в
// браузере (PhotoInput) и сразу ушёл на сервер, отдельной кнопки «Загрузить»
// нет.
export function AvatarUpload({ id, hasPhoto }: { id: string; hasPhoto: boolean }) {
  const [state, formAction, pending] = useActionState(
    async (prev: PhotoState, formData: FormData) => {
      const result = await setStaffPhotoAction(prev, formData);
      if (!result.error) showToast("Фото обновлено");
      return result;
    },
    { error: null },
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      {/* Поле вне label намеренно: PhotoInput рисует под собой абзац «Сжимаем
          фото…», а <p> внутри <label> браузер разбирает иначе, чем React. */}
      <label
        htmlFor={`avatar-${id}`}
        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-primary hover:text-primary ${
          pending ? "pointer-events-none opacity-60" : ""
        }`}
      >
        {pending && <Spinner className="h-3.5 w-3.5" />}
        {pending ? "Загружаем…" : hasPhoto ? "Сменить фото" : "Поставить фото"}
      </label>
      <PhotoInput
        id={`avatar-${id}`}
        name="photo"
        accept={PHOTO_ACCEPT}
        autoSubmit
        className="sr-only"
      />
      {state.error && <p className="mt-1 text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
