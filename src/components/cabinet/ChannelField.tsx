"use client";

import { useState } from "react";
import {
  CHANNEL_MAX,
  CHANNEL_OTHER,
  DEFAULT_CHANNEL_NAME,
  channelLabel,
} from "@/lib/channels";

// Поле «Канал записи» для формы заявки и обеих форм «Записать клиента».
//
// Список каналов приходит пропом из справочника booking_channels (0041) —
// раньше он был константой в коде, и рекламные каналы из «Материалов»
// приходилось вбивать руками. Закрытым список всё равно быть не может
// (пляжные точки, отели, конкретные зазывалы), поэтому последний пункт —
// «Другой…»: по его выбору открывается текстовое поле, и на сервер уезжает то,
// что вписали (см. pickChannel).
//
// Клиентский компонент только ради этого переключения; значение всё равно
// обычное поле формы, никакого состояния наружу не утекает.

type Variant = "cabinet" | "compact";

export function ChannelField({
  channels,
  defaultValue,
  className,
  variant = "cabinet",
  required = true,
}: {
  /** Активные каналы справочника, в порядке ведения. */
  channels: string[];
  /** Канал из заявки, если запись открыли из неё. Имя из справочника, старый
   *  ключ (до 0041) или свой текст. */
  defaultValue?: string | null;
  className: string;
  variant?: Variant;
  required?: boolean;
}) {
  // Канал из заявки мог быть вписан руками или заведён до появления
  // справочника — тогда select встаёт на «Другой…», а сам текст подставляется
  // в поле: админ не переписывает его заново. Старый ключ (walkin) сначала
  // переводим в имя — в справочнике лежит именно оно.
  const incoming = channelLabel(defaultValue);
  const known = Boolean(incoming && channels.includes(incoming));
  const custom = incoming && !known ? incoming : "";
  // Пустой справочник (миграцию ещё не накатили) — сразу свободный ввод,
  // иначе поле оказалось бы вообще без вариантов.
  const fallback = channels.includes(DEFAULT_CHANNEL_NAME)
    ? DEFAULT_CHANNEL_NAME
    : (channels[0] ?? CHANNEL_OTHER);
  const [choice, setChoice] = useState(
    !incoming ? fallback : known ? incoming : CHANNEL_OTHER,
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
        {channels.map((name) => (
          <option key={name} value={name}>
            {name}
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
