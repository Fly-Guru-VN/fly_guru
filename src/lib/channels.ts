// Каналы ручной записи: клиент подошёл на пляже, позвонил, написал в мессенджер
// или пришёл сам. Пишем значение в bookings.src (у заявки) и sessions.channel
// (у занятия) рядом с сайтовыми метками (instagram/qr/flyer/partner) — тогда
// Статистика показывает ВСЕ источники, а не только сайтовые, и живой поток
// перестаёт сваливаться в «прямые».
//
// Сам список с 0041 живёт в справочнике booking_channels, который админ ведёт
// в «Настройках» (getActiveDict из lib/dictionaries). Раньше он был константой
// здесь, и рекламные каналы из «Материалов» приходилось вбивать в форму
// руками. Хранится по-прежнему ТЕКСТ, а не ссылка на справочник: в той же
// колонке лежат метки рекламных ссылок и свободный текст пункта «Другой…».
//
// Список закрытым быть не может: точку на пляже, отель или конкретного
// зазывалу в справочник не уложить. Поэтому в форме остаётся пункт «Другой…» —
// свободный текст уходит в ту же колонку и показывается как есть.
//
// Живёт отдельным модулем, а не в admin/actions.ts: тот помечен "use server",
// а из таких файлов Next разрешает экспортировать только async-функции.

// Ключи, которыми каналы записывались ДО 0041. Миграция перевела старые строки
// на имена, но карта остаётся: она нужна, если код уже выкатили, а миграцию
// ещё не накатили, — иначе заявка показала бы сырое «walkin».
export const LEGACY_CHANNELS: Record<string, string> = {
  beach: "Пляжи",
  call: "Звонок",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  walkin: "Пришёл сам",
  repeat: "Постоянный клиент",
};

// Канал по умолчанию: почти весь живой поток школы приходит с пляжей, и
// подставленный вариант экономит клик на каждой записи. Если админ скрыл эту
// позицию в справочнике — форма встанет на первую из оставшихся.
export const DEFAULT_CHANNEL_NAME = "Пляжи";

// Пункт «Другой…» — не значение, а переключатель на свободный ввод. Символы
// такие, что случайно совпасть с настоящим каналом не могут.
export const CHANNEL_OTHER = "__other__";

// Свой канал длиннее строки в карточке никому не нужен, а колонка text примет
// что угодно — режем на входе.
export const CHANNEL_MAX = 60;

// Как показать канал: имя из справочника и свободный текст показываем как есть,
// старый ключ переводим по карте. null — канал не указан (заявки с сайта).
export function channelLabel(src: string | null | undefined): string | null {
  if (!src) return null;
  return LEGACY_CHANNELS[src] ?? src;
}

// Регистр и пробелы: ссылка приносит метку как есть (?src=instagram), а из
// справочника приезжает «Instagram». Без приведения к одному виду это два
// разных источника в отчётах.
export function normChannel(raw: string): string {
  return raw.trim().toLowerCase();
}

// Один и тот же канал школа знает под двумя именами: метка рекламной ссылки
// (materials.src — «gads») и её человеческое название, оно же позиция
// справочника («Реклама гугл»). Гость по ссылке приносит первое, инструктор
// руками выбирает второе, а в отчётах это обязан быть один источник.
//
// Отсюда общая свёртка: строим её из «Материалов» один раз на экран и просим
// у неё либо метку (для группировки), либо подпись (для показа).
export function channelNaming(materials: { src: string; label: string }[]) {
  const labelByTag = new Map<string, string>();
  const tagByAny = new Map<string, string>();
  for (const m of materials) {
    const tag = normChannel(m.src);
    labelByTag.set(tag, m.label);
    tagByAny.set(tag, tag);
    if (m.label) tagByAny.set(normChannel(m.label), tag);
  }
  return {
    /** Метка рекламной ссылки, к которой относится значение, — или null, если это ручной канал. */
    tagOf(value: string | null | undefined): string | null {
      return value ? (tagByAny.get(normChannel(value)) ?? null) : null;
    },
    /** Как показать канал: у рекламных — название из «Материалов», у остальных — как записано. */
    labelOf(value: string | null | undefined): string | null {
      const tag = this.tagOf(value);
      return tag ? (labelByTag.get(tag) ?? tag) : channelLabel(value);
    },
  };
}

// Канал из формы: либо выбранное имя из справочника, либо то, что вписали в
// «Другой…». null — не указан вовсе; вызывающий решает, ошибка это или пустое
// поле. Значение мимо справочника (скрыли позицию, пока форма была открыта)
// принимаем как есть: терять канал из-за этого хуже, чем сохранить строку.
export function pickChannel(
  raw: FormDataEntryValue | null,
  other: FormDataEntryValue | null,
): string | null {
  const value = String(raw ?? "").trim();
  const custom = String(other ?? "")
    .trim()
    .slice(0, CHANNEL_MAX);
  if (value === CHANNEL_OTHER) return custom || null;
  return value.slice(0, CHANNEL_MAX) || null;
}
