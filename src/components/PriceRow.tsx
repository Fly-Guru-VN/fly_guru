"use client";

import type { ReactNode } from "react";
import { useBooking } from "./BookingProvider";
import { AgentPrice, AgentDiscountNote } from "./AgentPrice";
import { IconArrowRight } from "./icons";

// Строка прайса, которая сама открывает форму записи с этой услугой.
//
// Раньше прайс был просто таблицей: человек находил нужную цену и должен был
// сам догадаться вернуться к кнопке «Записаться» наверху и выбрать услугу
// заново из списка. Теперь строка — это кнопка: тапнул по «Полёт в тандеме» и
// форма открылась уже с ним.
//
// Стрелка справа появляется только на ПК при наведении: на телефоне она
// висела бы всегда и съедала место у цены.
export function PriceRow({
  name,
  meta,
  price,
  code,
  serviceId,
  badge,
}: {
  name: string;
  // Длительность и примечание одной строкой под названием. У фото/видео
  // длительности нет — тогда строки под названием просто не будет.
  meta?: string;
  // Цена числом: строка прайса умеет показать её со скидкой, а для этого нужно
  // считать, а не печатать готовый текст. null — «по запросу».
  price: number | null;
  // Код услуги (basic-adult и т. п.) — по нему понятно, есть ли по ней
  // агентская скидка.
  code?: string | null;
  // id услуги в базе. Может не найтись (услугу выключили в админке) — тогда
  // форма откроется с общим списком.
  serviceId?: string;
  badge?: ReactNode;
}) {
  const { open } = useBooking();
  return (
    <button
      type="button"
      onClick={() => open({ serviceId, place: "prices" })}
      // Сетка, а не flex-wrap: у выездов длинное название с бейджем и
      // примечанием, и при переносе цена уезжала под текст вместо правого края.
      className="group grid w-full grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 p-4 text-left transition-colors hover:bg-surface-2 sm:px-5"
    >
      <span className="min-w-0">
        <span className="font-medium">
          {name}
          {badge}
        </span>
        {meta && <span className="block text-sm text-muted">{meta}</span>}
        {/* Скидка подписью под названием, а не у цены: справа строка узкая, и
            «−100 000 ₫ по ссылке агента» ломало бы её на телефоне. Кегль тот
            же, что у длительности: в text-sm подпись сама вставала в две
            строки на 390 px. */}
        <AgentDiscountNote
          code={code}
          price={price}
          className="block text-xs font-semibold text-accent-strong"
        />
      </span>
      <span className="flex items-center gap-2 whitespace-nowrap font-bold text-primary">
        {/* Столбиком, а не в строку: со скидкой в правой колонке две цены, и
            рядом друг с другом они отжимали название услуги в три строки. */}
        <span className="flex flex-col items-end leading-tight">
          <AgentPrice
            price={price}
            code={code}
            oldClassName="text-xs font-normal text-muted line-through"
          />
        </span>
        <IconArrowRight
          aria-hidden
          className="hidden h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100 sm:block"
        />
      </span>
    </button>
  );
}
