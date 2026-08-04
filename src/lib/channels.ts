// Каналы ручной записи: клиент подошёл на пляже, позвонил, написал в мессенджер
// или пришёл сам. Пишем ключ в bookings.src (у заявки) и sessions.channel (у
// занятия) рядом с сайтовыми метками (instagram/qr/flyer/partner) — тогда
// Статистика показывает ВСЕ источники, а не только сайтовые, и живой поток
// перестаёт сваливаться в «прямые».
//
// Список закрытым быть не может: точку на пляже, отель или конкретного
// зазывалу в пять вариантов не уложить. Поэтому в форме есть пункт «Другой…» —
// свободный текст уходит в ту же колонку и показывается как есть (channelLabel).
//
// Живёт отдельным модулем, а не в admin/actions.ts: тот помечен "use server",
// а из таких файлов Next разрешает экспортировать только async-функции.

export const MANUAL_CHANNELS: Record<string, string> = {
  beach: "Пляжи",
  call: "Звонок",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  walkin: "Пришёл сам",
  repeat: "Постоянный клиент",
};

// Канал по умолчанию: почти весь живой поток школы приходит с пляжей, и
// подставленный вариант экономит клик на каждой записи.
export const DEFAULT_CHANNEL = "beach";

// Пункт «Другой…» — не значение, а переключатель на свободный ввод. Символы
// такие, что случайно совпасть с настоящим каналом не могут.
export const CHANNEL_OTHER = "__other__";

// Свой канал длиннее строки в карточке никому не нужен, а колонка text примет
// что угодно — режем на входе.
export const CHANNEL_MAX = 60;

// Как показать канал: ключ из списка → человеческое имя, свободный текст → он
// сам. null — канал не указан (старые записи, заявки с сайта).
export function channelLabel(src: string | null | undefined): string | null {
  if (!src) return null;
  return MANUAL_CHANNELS[src] ?? src;
}

// Канал из формы: либо ключ списка, либо то, что вписали в «Другой…».
// null — не указан вовсе; вызывающий решает, ошибка это или пустое поле.
export function pickChannel(
  raw: FormDataEntryValue | null,
  other: FormDataEntryValue | null,
): string | null {
  const value = String(raw ?? "").trim();
  const custom = String(other ?? "")
    .trim()
    .slice(0, CHANNEL_MAX);
  if (value === CHANNEL_OTHER) return custom || null;
  if (MANUAL_CHANNELS[value]) return value;
  // Значение мимо списка (старая вкладка, ручной постинг) — принимаем как
  // свободный текст: терять канал из-за этого хуже, чем сохранить строку.
  return value.slice(0, CHANNEL_MAX) || null;
}
