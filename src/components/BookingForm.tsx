"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "@/i18n/navigation";
import { trackEvent } from "@/lib/analytics";
import { forgetRefCode, getAttributionForBooking } from "@/lib/attribution";
import { isValidPhone, PHONE_ERROR } from "@/lib/phone";
import { agentDiscountFor } from "@/lib/agentTerms";
import { formatVnd } from "@/content/services";
import { useAgentRef } from "./useAgentRef";
import { Spinner } from "./Spinner";

// Услуга в том минимальном виде, что нужен форме: id (для базы) + название.
// code — служебный ключ услуги из базы: по нему форма находит, что выбрать по
// умолчанию, не завися от названий и порядка списка. price — чтобы карточка
// показывала цену и, по агентской ссылке, скидку.
export interface ServiceOption {
  id: string;
  name: string;
  code?: string | null;
  price?: number | null;
}

// Что подставляем гостю, если страница не попросила конкретную услугу. Список
// приходит отсортированным по цене, поэтому «первая» — это самый дешёвый
// детский тандем; людям почти всегда нужно базовое обучение (пачка №6, п.1).
const DEFAULT_SERVICE_CODE = "basic-adult";

interface BookingFormProps {
  services: ServiceOption[]; // список услуг для выпадающего списка (из базы)
  defaultServiceId?: string; // какая услуга выбрана заранее (зависит от страницы)
  refCode?: string; // реф-код (на лендинге /r/[code]) — вшивается скрыто в заявку
  onSuccess?: () => void; // вызвать при успехе (модалка закрывается — иначе висит поверх /thanks)
}

// Каналы связи: по какому мессенджеру гостю удобнее, чтобы админ не гадал.
const MESSENGERS = ["WhatsApp", "Telegram", "Zalo"] as const;

// Общие классы полей ввода — чтобы все поля выглядели одинаково и в стиле сайта.
const inputClass =
  "w-full rounded-xl border border-line bg-surface px-4 py-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

type Status = "idle" | "submitting" | "error" | "badPhone";

export function BookingForm({ services, defaultServiceId, refCode, onSuccess }: BookingFormProps) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [phone, setPhone] = useState("");

  // Пришёл ли гость по ссылке живого агента и по чьей именно: от тарифа агента
  // зависит размер скидки на карточках услуг (у одного партнёра свои проценты).
  // Инструкторская ссылка скидки не даёт — проверяет сервер. null = не агент.
  const agentPlan = useAgentRef(refCode);
  const byAgent = agentPlan !== null;

  // Какая услуга выбрана. Раньше это был обычный <select> и состояние не было
  // нужно; теперь выбор — карточки, и подсветить надо ту, на которую нажали.
  const [serviceId, setServiceId] = useState(
    () =>
      defaultServiceId ??
      services.find((s) => s.code === DEFAULT_SERVICE_CODE)?.id ??
      services[0]?.id ??
      "",
  );

  // Показываем ошибку только после того, как гость начал печатать: пустое
  // поле при загрузке страницы не должно краснеть.
  const phoneBad = phone.trim().length > 0 && !isValidPhone(phone);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Отсекаем мусор до сети: иначе гость ждёт ответа сервера, чтобы узнать
    // то, что видно прямо здесь.
    if (!isValidPhone(phone)) {
      setStatus("badPhone");
      return;
    }
    setStatus("submitting");

    // Собираем значения полей из формы.
    const form = e.currentTarget;
    const data = new FormData(form);

    // Метки источника, которые мы запомнили при заходе (localStorage).
    // Если мы на реф-лендинге — код из ссылки главнее.
    const attribution = getAttributionForBooking();
    const payload = {
      clientName: String(data.get("clientName") ?? ""),
      contact: String(data.get("contact") ?? ""),
      telegram: String(data.get("telegram") ?? ""),
      messenger: String(data.get("messenger") ?? ""),
      serviceId: String(data.get("serviceId") ?? ""),
      preferredDate: String(data.get("preferredDate") ?? ""),
      comment: String(data.get("comment") ?? ""),
      honeypot: String(data.get("company") ?? ""), // поле-ловушка (см. ниже)
      ref_code: refCode || attribution.ref_code,
      src: attribution.src,
      utm: attribution.utm,
    };

    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("request failed");
      // Успех — уводим на страницу «спасибо» (с номером заявки, если сервер
      // его вернул: клиент сможет назвать номер при созвоне).
      const { bookingNo, refAccepted } = (await res.json()) as {
        bookingNo?: number | null;
        refAccepted?: boolean;
      };
      // Сервер не нашёл владельца кода — стираем его из браузера, иначе он
      // будет цепляться к заявкам ещё 30 дней (см. forgetRefCode).
      if (refAccepted === false) forgetRefCode();
      // Вторая половина воронки: сколько из открывших форму дошли до конца.
      // Услугу пишем кодом (basic-adult и т. п.), а не названием: названия в
      // базе правят, и статистика тогда разъезжается на две разные строки.
      const chosen = services.find((s) => s.id === payload.serviceId);
      trackEvent("booking_sent", {
        service: chosen?.code || chosen?.name || "unknown",
      });
      // Сначала закрываем модалку (если форма в ней): иначе панель с «Отправляем…»
      // и заблокированный скролл висят поверх /thanks — форма будто зависла,
      // хотя заявка ушла (пачка №5, п.1/3).
      onSuccess?.();
      router.push(bookingNo ? `/thanks?no=${bookingNo}` : "/thanks");
    } catch {
      setStatus("error");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Поле-ловушка (honeypot). Живой человек его не видит (скрыто стилями),
          а бот часто заполняет все поля. Если сюда что-то попало — сервер
          отбросит заявку как спам. aria-hidden + tabIndex убирают его от
          скринридеров и клавиатуры. */}
      <div className="absolute left-[-9999px]" aria-hidden="true">
        <label>
          Не заполняйте это поле
          <input type="text" name="company" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div>
        <label htmlFor="clientName" className="mb-1 block text-sm font-medium">
          Имя <span className="text-red-600">*</span>
        </label>
        <input id="clientName" name="clientName" type="text" required className={inputClass} />
      </div>

      {/* Телефон и ник — раздельно. Раньше это было одно поле «телефон ИЛИ
          ник», и заявки приходили без номера: позвонить было некому, а понять
          это удавалось только вручную. */}
      <div>
        <label htmlFor="contact" className="mb-1 block text-sm font-medium">
          Телефон <span className="text-red-600">*</span>
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="contact"
            name="contact"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+84 90 123 45 67"
            aria-invalid={phoneBad || undefined}
            className={`${inputClass} sm:flex-1`}
          />
          <select name="messenger" defaultValue={MESSENGERS[0]} className={`${inputClass} sm:w-40`}>
            {MESSENGERS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        {phoneBad && <p className="mt-1 text-sm text-red-600">{PHONE_ERROR}</p>}
      </div>

      <div>
        <label htmlFor="telegram" className="mb-1 block text-sm font-medium">
          Ник в Telegram
        </label>
        <input
          id="telegram"
          name="telegram"
          type="text"
          autoCapitalize="off"
          autoCorrect="off"
          placeholder="@username"
          className={inputClass}
        />
        {/* Одной строкой даже на узком телефоне — отсюда короткий текст и
            whitespace-nowrap с чуть меньшим кеглем (пачка №5, п.2). */}
        <p className="mt-1 whitespace-nowrap text-xs text-muted sm:text-sm">
          Необязательно — запасной способ связи
        </p>
      </div>

      {/* Услуга — карточками, а не выпадающим списком: только так на выборе
          видно цену и агентскую скидку. Внутри каждой карточки настоящий
          radio — форма отправляет его значение, а клавиатура и скринридеры
          получают обычный список переключателей.
          Карточка в одну строку (название слева, цена справа): услуг больше
          десятка, и в две строки каждая список не помещался бы на телефоне
          даже с прокруткой. */}
      <fieldset>
        <legend className="mb-1 block text-sm font-medium">Услуга</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {services.map((s) => {
            const price = s.price ?? null;
            const discount = agentPlan ? agentDiscountFor(s.code, price, agentPlan) : 0;
            const chosen = s.id === serviceId;
            return (
              <label
                key={s.id}
                className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors ${
                  chosen
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                    : "border-line bg-surface hover:border-primary/50"
                }`}
              >
                <input
                  type="radio"
                  name="serviceId"
                  value={s.id}
                  checked={chosen}
                  onChange={() => setServiceId(s.id)}
                  className="shrink-0 accent-primary"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium leading-snug">
                    {s.name}
                  </span>
                  {discount > 0 && (
                    <span className="block text-xs font-semibold text-accent-strong">
                      −{formatVnd(discount)} по ссылке агента
                    </span>
                  )}
                </span>
                {price !== null && (
                  <span className="shrink-0 text-right leading-tight">
                    {discount > 0 ? (
                      <>
                        <span className="block text-xs text-muted line-through">
                          {formatVnd(price)}
                        </span>
                        <span className="block text-sm font-bold text-accent-strong">
                          {formatVnd(Math.max(0, price - discount))}
                        </span>
                      </>
                    ) : (
                      <span className="block text-sm text-muted">
                        {formatVnd(price)}
                      </span>
                    )}
                  </span>
                )}
              </label>
            );
          })}
        </div>
        {byAgent && (
          // Честная оговорка: скидка даётся за ПЕРВОЕ базовое обучение. Гость,
          // который у нас уже учился, заплатит полную цену — обещать её всем
          // подряд нельзя (то же правило проверяется при оформлении).
          <p className="mt-2 text-xs text-muted">
            Скидка по ссылке агента — на первое базовое обучение.
          </p>
        )}
      </fieldset>

      <div>
        <label htmlFor="preferredDate" className="mb-1 block text-sm font-medium">
          Желаемая дата
        </label>
        {/* min-w-0 + appearance-none: нативный date-инпут на iOS/Android имеет
            собственную минимальную ширину и вылезал за края модалки на телефоне
            (пачка №5, п.1). Теперь он ужимается в строку, как остальные поля. */}
        <input
          id="preferredDate"
          name="preferredDate"
          type="date"
          className={`${inputClass} min-w-0 appearance-none`}
        />
      </div>

      <div>
        <label htmlFor="comment" className="mb-1 block text-sm font-medium">
          Комментарий
        </label>
        <textarea id="comment" name="comment" rows={3} className={inputClass} />
      </div>

      <button
        type="submit"
        disabled={status === "submitting"}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-7 py-4 text-base font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-60 sm:w-auto"
      >
        {status === "submitting" && <Spinner className="h-4 w-4" />}
        {status === "submitting" ? "Отправляем…" : "Записаться"}
      </button>

      {status === "badPhone" && (
        <p className="text-sm text-red-600">{PHONE_ERROR}</p>
      )}

      {status === "error" && (
        <p className="text-sm text-red-600">
          Не удалось отправить. Проверьте соединение и попробуйте ещё раз, либо напишите нам в мессенджер.
        </p>
      )}
    </form>
  );
}
