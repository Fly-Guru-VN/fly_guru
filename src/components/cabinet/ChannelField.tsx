"use client";

import { useState } from "react";
import {
  CHANNEL_MAX,
  CHANNEL_OTHER,
  DEFAULT_CHANNEL,
  MANUAL_CHANNELS,
} from "@/lib/channels";

// Поле «Канал записи» для формы заявки и обеих форм «Записать клиента».
//
// Список каналов закрытым быть не может (пляжные точки, отели, конкретные
// зазывалы), поэтому последний пункт — «Другой…»: по его выбору открывается
// текстовое поле, и на сервер уезжает то, что вписали (см. pickChannel).
// По умолчанию стоит «Пляжи» — оттуда приходит почти весь живой поток.
//
// Клиентский компонент только ради этого переключения; значение всё равно
// обычное поле формы, никакого состояния наружу не утекает.

type Variant = "cabinet" | "compact";

export function ChannelField({
  defaultValue,
  className,
  variant = "cabinet",
  required = true,
}: {
  /** Канал из заявки, если запись открыли из неё. Ключ списка или свой текст. */
  defaultValue?: string | null;
  className: string;
  variant?: Variant;
  required?: boolean;
}) {
  // Канал из заявки мог быть вписан руками — тогда select встаёт на «Другой…»,
  // а сам текст подставляется в поле: админ не переписывает его заново.
  const known = Boolean(defaultValue && MANUAL_CHANNELS[defaultValue]);
  const custom = defaultValue && !known ? defaultValue : "";
  const [choice, setChoice] = useState(
    !defaultValue ? DEFAULT_CHANNEL : known ? defaultValue : CHANNEL_OTHER,
  );

  const controls = (
    <>
      <select
        id="channel"
        name="channel"
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
        className={className}
      >
        {Object.entries(MANUAL_CHANNELS).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
        <option value={CHANNEL_OTHER}>Другой…</option>
      </select>
      {choice === CHANNEL_OTHER && (
        <input
          type="text"
          name="channelOther"
          defaultValue={custom}
          required={required}
          maxLength={CHANNEL_MAX}
          placeholder="откуда пришёл: точка, отель, имя"
          className={`mt-2 ${className}`}
        />
      )}
    </>
  );

  const label = `Канал записи${required ? " *" : ""}`;

  // Кабинет инструктора — крупные поля с подписью над ними; админка —
  // компактные внутри <label> общей сетки. Как в PaymentMethodField.
  return variant === "cabinet" ? (
    <div>
      <label htmlFor="channel" className="mb-1 block text-sm font-medium">
        {label}
      </label>
      {controls}
    </div>
  ) : (
    <label className="block text-xs text-muted">
      {label}
      <span className="mt-1 block">{controls}</span>
    </label>
  );
}
