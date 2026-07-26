// Загрузка фото в Supabase Storage: аватар инструктора (bucket avatars) и
// фото клиента (bucket clients, пак B).
//
// Константы жили внутри instructor/actions.ts и были продублированы в
// SettingsForm — файл с "use server" не умеет экспортировать обычные значения.
// С паком B появилось третье место, где нужны те же лимиты, поэтому вынесены
// сюда: три копии одного лимита рано или поздно разъезжаются.

// Форматы, которые умеет отдавать next/image. Это серверная проверка: в браузере
// кадр всё равно перекодируется в JPEG (components/cabinet/PhotoInput), так что
// сюда HEIC с айфона доезжает уже как JPEG.
export const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Чуть меньше лимита тела server actions (5 МБ в next.config.ts), чтобы
// остальные поля формы гарантированно влезли.
export const PHOTO_MAX_BYTES = 4 * 1024 * 1024;

// Берём любую картинку, включая HEIC с айфона: PhotoInput пережмёт её в JPEG
// ещё в браузере. Раньше здесь был белый список из трёх типов, и снимок из
// галереи айфона в HEIC просто не выбирался.
export const PHOTO_ACCEPT = "image/*";

// Проверка файла из формы. Возвращает расширение (для пути в бакете) либо
// текст ошибки — вызывающий экшен показывает его под кнопкой.
// Обе ошибки — страховка на случай, когда сжатие в браузере не сработало
// (незнакомый формат, старый движок): в норме сюда приезжает лёгкий JPEG.
export function checkPhoto(
  photo: File,
): { ext: string; error?: undefined } | { ext?: undefined; error: string } {
  const ext = PHOTO_TYPES[photo.type];
  if (!ext) return { error: "Не смогли обработать этот формат. Снимите кадр камерой." };
  if (photo.size > PHOTO_MAX_BYTES) {
    return { error: "Фото слишком большое и не сжалось. Попробуйте другой снимок." };
  }
  return { ext };
}
