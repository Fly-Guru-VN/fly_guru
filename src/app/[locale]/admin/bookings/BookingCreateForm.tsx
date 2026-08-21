"use client";

import { useActionState, useState } from "react";
import { createBookingAction } from "../actions";
import { ChannelField } from "@/components/cabinet/ChannelField";
import { NATIVE_PICKER } from "@/components/cabinet/fieldClasses";
import { Spinner } from "@/components/Spinner";

// Форма «Новая заявка»: клиент позвонил / написал / пришёл ногами. Заявку с
// сайта создаёт публичная форма, а этот поток раньше в CRM не попадал вообще.
// Клиентский компонент ради двух вещей: показать ошибку валидации без
// перезагрузки и свернуть форму, чтобы она не занимала ленту постоянно.

export interface ServiceOption {
  id: string;
  name: string;
}

const inputClass =
  "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary";

// Нативные поля даты и времени: то же оформление, что у остальных, плюс общий
// сброс системного вида (см. NATIVE_PICKER — там объяснение).
const nativeFieldClass = `${NATIVE_PICKER} ${inputClass}`;

export function BookingCreateForm({
  services,
  today,
  paymentMethods,
  channels,
}: {
  services: ServiceOption[];
  today: string;
  paymentMethods: { id: string; name: string }[];
  channels: string[];
}) {
  const [state, formAction, pending] = useActionState(createBookingAction, {
    error: null,
  });
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      // Кнопка-CTA: заводить заявки руками приходится каждый день, а пунктирная
      // серая рамка читалась как заглушка — её просто не замечали.
      //
      // На ПК кнопка компактная и стоит в одной строке с фильтрами: полосой во
      // всю ширину она отжимала саму ленту заявок вниз (10.08.2026). На
      // телефоне остаётся во всю ширину — там до неё тянутся пальцем.
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl bg-accent px-5 py-3 text-center text-white shadow-sm transition-colors hover:bg-accent-strong sm:w-auto sm:rounded-full sm:py-2"
      >
        <span className="block text-base font-bold sm:text-sm">+ Новая заявка</span>
        <span className="mt-0.5 block text-xs font-medium text-white/80 sm:hidden">
          звонок · мессенджер · пришёл сам
        </span>
      </button>
    );
  }

  return (
    <form
      action={formAction}
      // w-full: форма стоит в одной строке с фильтрами и в раскрытом виде
      // должна занимать всю ширину, а не остаток строки.
      className="w-full space-y-3 rounded-2xl border border-line bg-surface p-4"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-bold">Новая заявка</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs font-semibold text-muted transition-colors hover:text-foreground"
        >
          Свернуть
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-muted">
          Имя клиента
          <input type="text" name="clientName" required className={`mt-1 ${inputClass}`} />
        </label>
        <label className="text-xs text-muted">
          Телефон
          <input type="tel" name="phone" required className={`mt-1 ${inputClass}`} />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* Канал записи: список ведёт админ в «Настройках» (0041), по
            умолчанию «Пляжи». Разовую точку можно вписать руками — пункт
            «Другой…» в конце списка. */}
        <ChannelField variant="compact" className={inputClass} channels={channels} />
        <label className="text-xs text-muted">
          Услуга
          <select name="serviceId" className={`mt-1 ${inputClass}`}>
            <option value="">— не выбрана —</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Город — обязательный: без него в базе не видно, откуда к нам едут.
          Свободный текст, справочника нарочно нет. */}
      <label className="block text-xs text-muted">
        Город *
        <input
          type="text"
          name="city"
          required
          placeholder="Nha Trang"
          className={`mt-1 ${inputClass}`}
        />
      </label>

      {/* Формат оплаты (пак A, пункт 6) — здесь НЕобязателен: заявка это
          договорённость, клиент ещё не платил. Заполняют, когда о способе
          условились заранее (например, гость сказал «переведу на T-Bank»). */}
      <label className="block text-xs text-muted">
        Формат оплаты
        <select name="paymentMethodId" className={`mt-1 ${inputClass}`}>
          <option value="">— пока неизвестен —</option>
          {paymentMethods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      {/* «Уже оплатил» (0036): человек написал в инстаграм и сразу перевёл
          деньги, а катается послезавтра. Без этой отметки инструктор на пляже
          спрашивал деньги второй раз. Выручка от галочки не меняется — она
          считается по занятию, когда его запишут. */}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="paidMark"
          className="h-4 w-4 accent-primary"
        />
        Клиент уже оплатил
      </label>

      {/* Когда именно заплатил (0042). Пусто — значит в день занятия, и всё
          считается как раньше. Заполняют, когда деньги пришли раньше, иногда в
          прошлом месяце: дата переедет в занятие, и чек ляжет в кассу того
          месяца, когда платили. */}
      <label className="block text-xs text-muted">
        Дата оплаты (если платили не в день занятия)
        <input type="date" name="paidOn" className={`mt-1 ${nativeFieldClass}`} />
      </label>

      {/* Дата и время на телефоне налезали друг на друга. Лечится в двух местах:
          • ячейка грида по умолчанию не ужимается (min-width: auto) — min-w-0;
          • сам нативный контрол в Safari на iOS игнорирует width и держит свою
            «естественную» ширину (у него она ещё и зависит от локали телефона:
            07/23/2026 и 12:00 PM шире, чем 23.07.2026 и 12:00) — снимаем с него
            нативное оформление (appearance), только тогда он слушается ширину.
          items-end держит поля на одной линии, если подпись перенеслась. */}
      <div className="grid grid-cols-2 items-end gap-2">
        <label className="min-w-0 text-xs text-muted">
          Дата (можно будущую)
          <input
            type="date"
            name="preferredDate"
            defaultValue={today}
            className={`mt-1 ${nativeFieldClass}`}
          />
        </label>
        <label className="min-w-0 text-xs text-muted">
          Время
          <input type="time" name="scheduledTime" className={`mt-1 ${nativeFieldClass}`} />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-muted">
          Возраст
          <input type="number" name="age" min={1} className={`mt-1 ${inputClass}`} />
        </label>
        <label className="text-xs text-muted">
          Вес, кг
          <input type="number" name="weight" min={1} className={`mt-1 ${inputClass}`} />
        </label>
      </div>

      <label className="block text-xs text-muted">
        Комментарий
        <input
          type="text"
          name="note"
          placeholder="о чём договорились"
          className={`mt-1 ${inputClass}`}
        />
      </label>

      {/* По умолчанию сразу «Подтверждена»: по телефону уже договорились, и
          запись должна тут же попасть в календарь и к инструкторам. */}
      <label className="block text-xs text-muted">
        Статус
        <select name="status" defaultValue="confirmed" className={`mt-1 ${inputClass}`}>
          <option value="confirmed">Подтверждена — сразу в календарь</option>
          <option value="new">Новая — ещё созвониться</option>
        </select>
      </label>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
      >
        {pending && <Spinner />}
        {pending ? "Сохраняем…" : "Создать заявку"}
      </button>
    </form>
  );
}
