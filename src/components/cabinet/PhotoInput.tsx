"use client";

import { useRef, useState } from "react";
import { compressImage } from "@/lib/imageCompress";
import { Spinner } from "../Spinner";

// Поле выбора фото со сжатием в браузере. Один компонент на все места загрузки:
// смена (инструктор и механик), фото клиента, аватарка в настройках.
//
// Что делает сверх обычного input[type=file]: пережимает выбранный кадр
// (см. lib/imageCompress) и подменяет им файл в самом поле — дальше форма
// уходит на сервер как обычно, экшены править не пришлось. Пока идёт сжатие,
// показываем «Сжимаем фото…»: на старом телефоне крупный кадр занимает секунду.
//
// Поле НЕ блокируем на время сжатия намеренно: disabled-инпут браузер в
// FormData не кладёт, и автосабмит уехал бы на сервер без файла.

export function PhotoInput({
  name,
  accept = "image/*",
  capture,
  required,
  disabled,
  className,
  id,
  autoSubmit = false,
  confirmText,
  onPicked,
}: {
  name: string;
  accept?: string;
  capture?: "environment" | "user";
  required?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
  // Отправить форму сразу после выбора файла (экран смены: кнопки «загрузить»
  // там нет, снимок засчитывается по выбору).
  autoSubmit?: boolean;
  // Спросить подтверждение перед автоотправкой. Нужно ровно там, где кадр —
  // это действие с последствиями: фото у бара закрывает смену, а закрыться
  // случайно раньше 18:00 значит потерять премию за выход.
  confirmText?: string;
  // Готовый (уже сжатый) файл — для локального предпросмотра. null, когда выбор
  // сбросили.
  onPicked?: (file: File | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  // Защита от повторного входа: пока жмём кадр, второй onChange игнорируем.
  const working = useRef(false);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const form = input.form;
    const file = input.files?.[0];
    if (!file) {
      onPicked?.(null);
      return;
    }
    if (working.current) return;
    // Спрашиваем ДО сжатия: незачем жать кадр, который сейчас отменят.
    if (autoSubmit && confirmText && !window.confirm(confirmText)) {
      input.value = ""; // иначе тот же файл второй раз не выберется (onChange не сработает)
      onPicked?.(null);
      return;
    }
    working.current = true;
    setBusy(true);
    try {
      const compressed = await compressImage(file);
      if (compressed !== file) {
        // Кладём сжатый файл обратно в поле. DataTransfer есть во всех живых
        // браузерах, но если вдруг нет — уходит оригинал, а размер проверит
        // сервер.
        try {
          const dt = new DataTransfer();
          dt.items.add(compressed);
          input.files = dt.files;
        } catch {
          /* оставляем как есть */
        }
      }
      onPicked?.(input.files?.[0] ?? compressed);
    } finally {
      working.current = false;
      setBusy(false);
    }
    if (autoSubmit) form?.requestSubmit();
  }

  return (
    <>
      <input
        id={id}
        name={name}
        type="file"
        accept={accept}
        capture={capture}
        required={required}
        disabled={disabled}
        onChange={handleChange}
        className={className}
      />
      {busy && (
        <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-primary">
          <Spinner className="h-3.5 w-3.5" />
          Сжимаем фото…
        </p>
      )}
    </>
  );
}
