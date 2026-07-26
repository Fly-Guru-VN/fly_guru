// Сжатие фото прямо в браузере, перед отправкой на сервер.
//
// Зачем: айфон снимает кадры на 3–8 МБ, а тело server action ограничено 5 МБ
// (next.config.ts) — снимок со смены или фото клиента просто отбивалось
// «Фото больше 4 МБ». Просить инструктора на пляже «сожмите фото» бессмысленно,
// поэтому жмём сами: масштабируем до разумной стороны и перекодируем в JPEG.
//
// Побочно чинится HEIC: Safari на айфоне такой кадр декодирует, а наружу отсюда
// всегда уходит JPEG — сервер (PHOTO_TYPES) его принимает.
//
// Модуль браузерный: импортировать только из клиентских компонентов.

// Больше 2000 px по длинной стороне ни одному нашему экрану не нужно: самое
// крупное место показа — миниатюра смены и карточка клиента.
const MAX_SIDE = 2000;

// Целимся заметно ниже серверного лимита (PHOTO_MAX_BYTES = 4 МБ): остальные
// поля формы тоже едут в том же теле запроса.
const TARGET_BYTES = 3 * 1024 * 1024;

// Шаги качества: первый обычно и срабатывает, остальные — для очень крупных
// кадров (панорамы, HDR).
const QUALITY_STEPS = [0.82, 0.7, 0.6];

interface Decoded {
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  release: () => void;
}

// Декодируем кадр. createImageBitmap быстрее и не держит DOM-узел, но в старых
// Safari его для Blob нет — тогда обычный <img> с blob:-ссылкой.
async function decode(file: File): Promise<Decoded | null> {
  if (typeof createImageBitmap === "function") {
    try {
      let bitmap: ImageBitmap;
      try {
        // from-image — чтобы портретный кадр с айфона не лёг набок: EXIF-поворот
        // применяется при декодировании.
        bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      } catch {
        // Старые движки такой опции не знают — пробуем без неё.
        bitmap = await createImageBitmap(file);
      }
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
        release: () => bitmap.close(),
      };
    } catch {
      // Формат браузеру незнаком (HEIC вне Safari) — уходим на <img>.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode failed"));
      el.src = url;
    });
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
      release: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

function jpegName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "") || "photo";
  return `${base}.jpg`;
}

/**
 * Возвращает сжатый JPEG. Если сжать не вышло (неизвестный формат, нет canvas,
 * результат оказался тяжелее оригинала) — отдаёт исходный файл: пусть решает
 * сервер, чем ронять загрузку в браузере.
 */
export async function compressImage(file: File): Promise<File> {
  if (typeof document === "undefined") return file;
  if (file.type && !file.type.startsWith("image/")) return file;

  // Маленький кадр не трогаем: перекодирование только испортит качество.
  const alreadySmall = file.size <= TARGET_BYTES;

  const decoded = await decode(file);
  if (!decoded || !decoded.width || !decoded.height) return file;

  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(decoded.width, decoded.height));
    // Мелкий и лёгкий кадр — уменьшать нечего и жать незачем.
    if (scale === 1 && alreadySmall) return file;

    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // Под фото — белая подложка: у PNG с прозрачностью иначе будет чёрный фон.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    decoded.draw(ctx, width, height);

    let best: Blob | null = null;
    for (const quality of QUALITY_STEPS) {
      const blob = await toBlob(canvas, quality);
      if (!blob) break;
      best = blob;
      if (blob.size <= TARGET_BYTES) break;
    }
    if (!best) return file;
    // Пережали в плюс (бывает на скриншотах и графике) — оставляем оригинал,
    // но только если он и так пролезал по размеру.
    if (best.size >= file.size && alreadySmall) return file;

    return new File([best], jpegName(file.name), {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    decoded.release();
  }
}
