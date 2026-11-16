"use client";

import { useActionState, useState } from "react";
import { createBookingAction } from "../actions";
import { ChannelField } from "@/components/cabinet/ChannelField";
import { NATIVE_PICKER } from "@/components/cabinet/fieldClasses";
import { Spinner } from "@/components/Spinner";
import { PaidFields } from "./PaidFields";

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

      {/* Порядок полей — как идёт разговор: кто → что → когда → откуда.
          Города здесь нет (16.11.2026): его не читала ни одна выборка, а
          обязательным полем он только тормозил запись. */}
      <label className="block text-xs text-muted">
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

      {/* Канал записи: список ведёт админ в «Настройках» (0041), по
          умолчанию «Пляжи». Разовую точку можно вписать руками — пункт
          «Другой…» в конце списка. Нужен «Источникам» и «Статистике». */}
      <ChannelField variant="compact" className={inputClass} channels={channels} />

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

      {/* «Уже оплатил» (0036) и поля оплаты за ним — общий блок с карточкой
          заявки. Выручка от галочки не меняется: она считается по занятию. */}
      <PaidFields paymentMethods={paymentMethods} />

      {/* Статуса в форме нет: ручная заявка всегда уже согласована и сразу
          уходит в календарь и к инструкторам. */}

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
