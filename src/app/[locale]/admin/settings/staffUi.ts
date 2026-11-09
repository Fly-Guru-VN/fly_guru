import { NATIVE_PICKER } from "@/components/cabinet/fieldClasses";

// Оформление карточки сотрудника в «Настройках» (09.11.2026). Раньше все
// действия были одинаковыми серыми ссылками, и начальнику было не понять,
// что безобидно, а что закрывает человеку вход. Теперь у каждой группы свой
// цвет, а действия выглядят как кнопки: обычные белые, опасные красные.

export const btn =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-ink shadow-sm transition-colors hover:border-primary hover:text-primary-strong disabled:opacity-50";

export const btnPrimary =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-strong disabled:opacity-50";

export const btnDanger =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 shadow-sm transition-colors hover:border-red-600 hover:bg-red-600 hover:text-white disabled:opacity-50";

export const fieldLabel = "text-xs font-medium text-slate-700";

export const dateInput = `${NATIVE_PICKER} mt-1 block rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-ink outline-none focus:border-primary`;

export const textInput =
  "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-primary";

export type BlockTone = "work" | "money" | "sick" | "login" | "danger";

export const TONE: Record<BlockTone, { box: string; title: string }> = {
  work: { box: "border-sky-200 bg-sky-50", title: "text-sky-900" },
  money: { box: "border-emerald-200 bg-emerald-50", title: "text-emerald-900" },
  sick: { box: "border-amber-200 bg-amber-50", title: "text-amber-900" },
  login: { box: "border-indigo-200 bg-indigo-50", title: "text-indigo-900" },
  danger: { box: "border-red-200 bg-red-50", title: "text-red-800" },
};
