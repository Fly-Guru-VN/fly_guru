import { vnClock } from "@/lib/dates";
import type { PhotoKind, PhotoPhase } from "@/lib/shifts";

// Правила смены (пачка правок №4, пак C, пункт 5).
//
// Договорённость с начальником, дословно:
//   открыл до 9:00  — вовремя;   после 9:00  — поздно;
//   закрыл до 18:00 — залёт;     после 18:00 — всё чётко.
//
// Штрафов пока нет намеренно: задача — чтобы босс ВИДЕЛ картину, а не чтобы
// система наказывала. Поэтому здесь только метки, никакой арифметики по ЗП.
//
// Отдельный модуль, потому что этими правилами пользуются трое: кабинет
// инструктора (показать статус своей смены), админка (лента дня и календарь)
// и крон напоминалок. Продублируй их — и однажды разойдутся.

export const OPEN_DEADLINE_HOUR = 9; // до 9:00 — вовремя
export const CLOSE_DEADLINE_HOUR = 18; // после 18:00 — норма

export type OpenStatus = "onTime" | "late" | "notOpened";
export type CloseStatus = "ok" | "early" | "notClosed";

export interface ShiftStatus {
  open: OpenStatus;
  close: CloseStatus;
  /** Есть на что смотреть боссу: опоздание или ранний уход. */
  flagged: boolean;
}

export function openStatus(openedAt: string | null): OpenStatus {
  if (!openedAt) return "notOpened";
  return vnClock(openedAt).hour < OPEN_DEADLINE_HOUR ? "onTime" : "late";
}

export function closeStatus(closedAt: string | null): CloseStatus {
  if (!closedAt) return "notClosed";
  // «до 18:00» = закрылся раньше положенного. Ровно 18:00 и позже — норма.
  return vnClock(closedAt).hour < CLOSE_DEADLINE_HOUR ? "early" : "ok";
}

export function shiftStatus(
  openedAt: string | null,
  closedAt: string | null,
): ShiftStatus {
  const open = openStatus(openedAt);
  const close = closeStatus(closedAt);
  return { open, close, flagged: open === "late" || close === "early" };
}

// Подписи для интерфейса. Держим рядом с правилами, чтобы формулировка
// «залёт» не разъехалась по экранам.
export const OPEN_LABEL: Record<OpenStatus, string> = {
  onTime: "вовремя",
  late: "поздно",
  notOpened: "не открыта",
};

export const CLOSE_LABEL: Record<CloseStatus, string> = {
  ok: "всё чётко",
  early: "залёт",
  notClosed: "не закрыта",
};

// Подписи к снимкам смены. Раньше жили только внутри экрана «Смена», из-за
// чего в календаре кадры шли без пояснения — было непонятно, что на фото
// (пачка №5, п.9: «надо подписывать каждое фото»).
export const PHOTO_KIND_LABEL: Record<PhotoKind, string> = {
  board: "Доска",
  wing: "Крыло",
  comms: "Связь",
  extra: "Дефект",
  checkin: "На месте",
};

export const PHOTO_PHASE_LABEL: Record<PhotoPhase, string> = {
  open: "Открытие",
  close: "Закрытие",
};

// Обязательный кадр обеих фаз — один и тот же вид 'checkin', но снимают в разных
// местах: утром на пляже («я на работе»), вечером у бара на выходе с территории
// («я как раз ухожу»). Отдельный вид ради этого заводить не стали — по фазе и
// так понятно, что за кадр, а лишнее значение в базе означало бы миграцию.
export function photoLabel(kind: PhotoKind, phase: PhotoPhase): string {
  if (kind === "checkin") return phase === "open" ? "На пляже" : "У бара";
  return PHOTO_KIND_LABEL[kind];
}

// Цвет метки: тревожное — красным, нормальное — приглушённым.
// Возвращаем классы Tailwind, а не «цвет» — так вызывающий не выдумывает свои.
export function statusClass(bad: boolean): string {
  return bad
    ? "bg-red-500/10 text-red-600"
    : "bg-primary/10 text-primary";
}
