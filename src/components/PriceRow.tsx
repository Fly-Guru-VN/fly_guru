"use client";

import type { ReactNode } from "react";
import { useBooking } from "./BookingProvider";
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
  serviceId,
  badge,
}: {
  name: string;
  // Длительность и примечание одной строкой под названием. У фото/видео
  // длительности нет — тогда строки под названием просто не будет.
  meta?: string;
  price: string;
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
      </span>
      <span className="flex items-center gap-2 whitespace-nowrap font-bold text-primary">
        {price}
        <IconArrowRight
          aria-hidden
          className="hidden h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100 sm:block"
        />
      </span>
    </button>
  );
}
