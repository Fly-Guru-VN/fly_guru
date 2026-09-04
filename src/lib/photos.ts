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

const SHIFT_PHASES = new Set(["open", "close"]);
const SHIFT_KINDS = new Set(["board", "wing", "comms", "extra", "checkin"]);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_FILE_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

// Новые фото клиента лежат как <client-id>/<random-uuid>.<ext>. Старый
// формат <client-id>.<ext> тоже признаём своим, чтобы после первой замены
// удалить legacy-объект. Любой иной путь service_role удалять не должен.
export function isClientPhotoStoragePath(
  clientId: string,
  path: unknown,
): path is string {
  if (!isUuid(clientId) || typeof path !== "string") return false;
  if (["jpg", "png", "webp"].some((ext) => path === `${clientId}.${ext}`)) {
    return true;
  }
  return path.startsWith(`${clientId}/`) && UUID_FILE_RE.test(path.slice(clientId.length + 1));
}

export function isShiftPhotoStoragePath(photo: {
  shift_id: unknown;
  phase: unknown;
  kind: unknown;
  path: unknown;
}): boolean {
  if (
    typeof photo.shift_id !== "string" ||
    typeof photo.phase !== "string" ||
    typeof photo.kind !== "string" ||
    typeof photo.path !== "string" ||
    !SHIFT_PHASES.has(photo.phase) ||
    !SHIFT_KINDS.has(photo.kind)
  ) {
    return false;
  }

  const prefix = `${photo.shift_id}/${photo.phase}-${photo.kind}-`;
  return photo.path.startsWith(prefix) && UUID_FILE_RE.test(photo.path.slice(prefix.length));
}

// Проверка файла из формы. Возвращает расширение (для пути в бакете) либо
// текст ошибки — вызывающий экшен показывает его под кнопкой.
// Обе ошибки — страховка на случай, когда сжатие в браузере не сработало
// (незнакомый формат, старый движок): в норме сюда приезжает лёгкий JPEG.
export async function checkPhoto(
  photo: File,
): Promise<
  { ext: string; error?: undefined } | { ext?: undefined; error: string }
> {
  const ext = PHOTO_TYPES[photo.type];
  if (!ext) return { error: "Не смогли обработать этот формат. Снимите кадр камерой." };
  if (photo.size > PHOTO_MAX_BYTES) {
    return { error: "Фото слишком большое и не сжалось. Попробуйте другой снимок." };
  }

  // MIME — обычное поле формы: его может написать любой HTTP-клиент. Сверяем
  // его с magic bytes, чтобы под видом публичного аватара нельзя было положить
  // HTML/скрипт или произвольный файл. Читаем только первые 12 байт.
  const bytes = new Uint8Array(await photo.slice(0, 12).arrayBuffer());
  const isJpeg =
    bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng =
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (byte, index) => bytes[index] === byte,
    );
  const isWebp =
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  const signatureMatches =
    (ext === "jpg" && isJpeg) ||
    (ext === "png" && isPng) ||
    (ext === "webp" && isWebp);
  if (!signatureMatches) {
    return { error: "Файл повреждён или не является поддерживаемым фото." };
  }

  return { ext };
}
