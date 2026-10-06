"use client";

import { useState } from "react";
import { vnd } from "@/lib/stats";
import {
  EXCURSION_GROUP_FROM,
  EXCURSION_GROUP_PRICE,
  TOURS_MAX_PEOPLE,
  tourPricePerPerson,
} from "@/lib/tours";

// Поля тура (экскурсия, сафари) внутри формы записи — у админа и у
// инструктора. Появляются, только когда выбрана услуга-тур. Число людей —
// управляемое: от него родитель считает подсказку суммы. Участники — строки
// «имя + телефон»: сервер найдёт человека в базе по телефону или заведёт.
// Контактное лицо — это клиент самой формы, его сюда не вписывают.

export function TourFields({
  code,
  listPrice,
  people,
  onPeopleChange,
  inputClass,
  labelClass = "block text-xs text-muted",
}: {
  code: string | null | undefined;
  listPrice: number;
  people: number;
  onPeopleChange: (n: number) => void;
  inputClass: string;
  labelClass?: string;
}) {
  // Ключи строк — счётчиком: удаление из середины не должно сдвигать
  // введённый текст в соседнюю строку.
  const [rows, setRows] = useState<number[]>([]);
  const [seq, setSeq] = useState(0);
  const each = tourPricePerPerson(code, listPrice, people);
  const groupRule = code === "excursion";

  return (
    <div className="space-y-3 rounded-xl border border-line p-3">
      <label className={labelClass}>
        Сколько человек
        <input
          type="number"
          name="people"
          inputMode="numeric"
          min={1}
          max={TOURS_MAX_PEOPLE}
          step={1}
          value={people}
          onChange={(e) => {
            const n = Math.trunc(Number(e.target.value));
            onPeopleChange(Number.isFinite(n) && n >= 1 ? Math.min(n, TOURS_MAX_PEOPLE) : 1);
          }}
          className={`mt-1 ${inputClass}`}
        />
      </label>
      <p className="text-xs text-muted">
        По прайсу: {people} × {vnd(each)} = <b className="text-ink">{vnd(each * people)}</b>
        {groupRule &&
          ` · от ${EXCURSION_GROUP_FROM} человек по ${vnd(EXCURSION_GROUP_PRICE)} с каждого`}
      </p>

      <div className="space-y-2">
        <p className="text-xs text-muted">
          Другие участники — если это разные люди, каждого можно завести клиентом
          (необязательно).
        </p>
        {rows.map((key) => (
          <div key={key} className="flex items-end gap-2">
            <label className={`min-w-0 flex-1 ${labelClass}`}>
              Имя
              <input type="text" name="participantName" className={`mt-1 ${inputClass}`} />
            </label>
            <label className={`min-w-0 flex-1 ${labelClass}`}>
              Телефон
              <input
                type="tel"
                name="participantPhone"
                inputMode="tel"
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <button
              type="button"
              onClick={() => setRows((r) => r.filter((k) => k !== key))}
              aria-label="Убрать участника"
              className="mb-1 shrink-0 rounded-full px-3 py-2 text-sm text-muted hover:text-red-600"
            >
              ✕
            </button>
          </div>
        ))}
        {rows.length < TOURS_MAX_PEOPLE - 1 && (
          <button
            type="button"
            onClick={() => {
              setRows((r) => [...r, seq]);
              setSeq((n) => n + 1);
            }}
            className="rounded-full border border-line px-4 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-primary hover:text-primary"
          >
            + участник
          </button>
        )}
      </div>
    </div>
  );
}
