"use client";

import { useRef, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { trackEvent } from "@/lib/analytics";
import { forgetRefCode, getAttributionForBooking } from "@/lib/attribution";
import { isValidPhone } from "@/lib/phone";
import { agentDiscountFor } from "@/lib/agentTerms";
import { type ServiceCategory } from "@/content/services";
import { useAgentRef } from "./useAgentRef";
import { ServicePicker } from "./ServicePicker";
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
  // Группа услуги («Обучение», «Тандем», …). Нужна выпадающему списку: услуг
  // больше десятка, и без заголовков групп это просто длинная простыня.
  category?: ServiceCategory | null;
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

// Подарочный сертификат (0059). Гость вводит номер с бумажного бланка, и
// услуга подставляется сама — она у сертификата своя и выбору не подлежит.
type CertState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "ok"; serviceName: string }
  | { kind: "bad"; message: string };

// Почему номер не подошёл — словами гостя. Ключи приходят с сервера
// (api/certificates/check и ошибки самой заявки), а текст к ним подбираем на
// языке гостя.
const CERT_MESSAGE_KEYS: Record<string, string> = {
  not_found: "certificateNotFound",
  used: "certificateUsed",
  expired: "certificateExpired",
  rate_limited: "certificateRateLimited",
};

export function BookingForm({ services, defaultServiceId, refCode, onSuccess }: BookingFormProps) {
  const t = useTranslations("Booking");
  // Язык страницы уезжает в заявку (0060): админ и инструктор должны знать, на
  // каком языке звонить гостю, а не выяснять это в первую минуту разговора.
  const locale = useLocale();
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

  // Номер сертификата и что про него сказал сервер. Проверяем по уходу из
  // поля, а не на каждую букву: у проверки жёсткий лимит частоты (перебор
  // номеров), и печатающий человек съел бы его за секунду.
  const [certCode, setCertCode] = useState("");
  const [cert, setCert] = useState<CertState>({ kind: "idle" });
  const checkedCode = useRef("");

  // Причина отказа → фраза на языке гостя. Неизвестная причина (или обрыв
  // сети) сводится к общему «попробуйте ещё раз».
  const certMessage = (reason?: string | null) =>
    t(CERT_MESSAGE_KEYS[reason ?? ""] ?? "certificateError");

  async function checkCertificate() {
    const code = certCode.trim();
    if (!code) {
      setCert({ kind: "idle" });
      checkedCode.current = "";
      return;
    }
    // Тот же номер второй раз не спрашиваем: гость мог просто кликнуть мимо.
    if (checkedCode.current === code && cert.kind !== "idle") return;

    checkedCode.current = code;
    setCert({ kind: "checking" });
    try {
      const res = await fetch("/api/certificates/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        reason?: string;
        serviceId?: string;
        serviceName?: string;
      };
      if (data.ok && data.serviceId) {
        setServiceId(data.serviceId);
        setCert({
          kind: "ok",
          serviceName: data.serviceName ?? t("certificateFallbackService"),
        });
        return;
      }
      setCert({ kind: "bad", message: certMessage(data.reason) });
    } catch {
      setCert({ kind: "bad", message: certMessage(null) });
    }
  }

  // Снять сертификат: гость ошибся номером или передумал — возвращаем ему
  // обычный выбор услуги.
  function dropCertificate() {
    setCertCode("");
    setCert({ kind: "idle" });
    checkedCode.current = "";
  }

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
      // Из состояния, а не из FormData: выбор живёт в свёрнутом списке, и
      // читать его надо там же, где им управляют.
      serviceId,
      preferredDate: String(data.get("preferredDate") ?? ""),
      comment: String(data.get("comment") ?? ""),
      // Номер шлём как есть, даже непроверенный: последнее слово всё равно за
      // сервером — он гасит сертификат и сам ставит его услугу.
      certificateCode: certCode.trim(),
      locale,
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
      if (!res.ok) {
        // Сертификат мог «сгореть» между проверкой и отправкой — например, его
        // ввёл кто-то ещё. Это не поломка сети, и гостю надо сказать именно
        // про номер, а не «попробуйте ещё раз».
        const failed = (await res.json().catch(() => null)) as { error?: string } | null;
        const reason = failed?.error?.startsWith("certificate_")
          ? failed.error.slice("certificate_".length)
          : null;
        if (reason) {
          setCert({ kind: "bad", message: certMessage(reason) });
          setStatus("idle");
          return;
        }
        throw new Error("request failed");
      }
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
          {t("honeypot")}
          <input type="text" name="company" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div>
        <label htmlFor="clientName" className="mb-1 block text-sm font-medium">
          {t("name")} <span className="text-red-600">*</span>
        </label>
        <input id="clientName" name="clientName" type="text" required className={inputClass} />
      </div>

      {/* Телефон и ник — раздельно. Раньше это было одно поле «телефон ИЛИ
          ник», и заявки приходили без номера: позвонить было некому, а понять
          это удавалось только вручную. */}
      <div>
        <label htmlFor="contact" className="mb-1 block text-sm font-medium">
          {t("phone")} <span className="text-red-600">*</span>
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
            placeholder={t("phonePlaceholder")}
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
        {phoneBad && <p className="mt-1 text-sm text-red-600">{t("phoneError")}</p>}
      </div>

      <div>
        <label htmlFor="telegram" className="mb-1 block text-sm font-medium">
          {t("telegram")}
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
          {t("telegramHint")}
        </p>
      </div>

      {/* Сертификат. Стоит ПЕРЕД услугой: введённый номер её и задаёт, и
          показывать после этого список выбора незачем. */}
      <div>
        <label htmlFor="certificateCode" className="mb-1 block text-sm font-medium">
          {t("certificate")}{" "}
          <span className="font-normal text-muted">{t("certificateOptional")}</span>
        </label>
        <div className="flex gap-2">
          <input
            id="certificateCode"
            type="text"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            placeholder="FG-7K3M-92QD"
            value={certCode}
            onChange={(e) => {
              setCertCode(e.target.value);
              if (cert.kind !== "idle") setCert({ kind: "idle" });
            }}
            onBlur={checkCertificate}
            aria-invalid={cert.kind === "bad" || undefined}
            className={`${inputClass} min-w-0 flex-1 uppercase`}
          />
          {cert.kind === "ok" && (
            <button
              type="button"
              onClick={dropCertificate}
              className="shrink-0 rounded-xl border border-line px-4 text-sm font-semibold text-muted transition-colors hover:border-primary"
            >
              {t("certificateRemove")}
            </button>
          )}
        </div>
        {cert.kind === "checking" && (
          <p className="mt-1 flex items-center gap-2 text-sm text-muted">
            <Spinner className="h-4 w-4" />
            {t("certificateChecking")}
          </p>
        )}
        {cert.kind === "bad" && <p className="mt-1 text-sm text-red-600">{cert.message}</p>}
        {cert.kind === "idle" && (
          <p className="mt-1 text-xs text-muted sm:text-sm">
            {t("certificateHint")}
          </p>
        )}
      </div>

      {/* Услуга — свёрнутым списком. Все услуги разом занимали пол-формы, и
          на телефоне до даты и комментария приходилось долго крутить.
          Цена и агентская скидка никуда не делись: они видны и в свёрнутой
          строке, и в раскрытом списке.
          По сертификату выбора нет: услуга у него своя, и менять её гость не
          может — сервер всё равно поставит ту, что записана в сертификате. */}
      {cert.kind === "ok" ? (
        <div className="rounded-xl border border-line bg-surface px-4 py-3">
          <p className="text-sm font-medium">
            {t("certificateChosen", { service: cert.serviceName })}
          </p>
          <p className="mt-1 text-xs text-muted sm:text-sm">
            {t("certificateChosenHint")}
          </p>
        </div>
      ) : (
      <div>
        <ServicePicker
          services={services}
          value={serviceId}
          onChange={setServiceId}
          discountFor={(s) =>
            agentPlan ? agentDiscountFor(s.code, s.price ?? null, agentPlan) : 0
          }
        />
        {byAgent && (
          // Честная оговорка: скидка даётся за ПЕРВОЕ базовое обучение. Гость,
          // который у нас уже учился, заплатит полную цену — обещать её всем
          // подряд нельзя (то же правило проверяется при оформлении).
          <p className="mt-2 text-xs text-muted">
            {t("agentDiscountNote")}
          </p>
        )}
      </div>
      )}

      <div>
        <label htmlFor="preferredDate" className="mb-1 block text-sm font-medium">
          {t("date")}
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
          {t("comment")}
        </label>
        <textarea id="comment" name="comment" rows={3} className={inputClass} />
      </div>

      <button
        type="submit"
        disabled={status === "submitting"}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-7 py-4 text-base font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-60 sm:w-auto"
      >
        {status === "submitting" && <Spinner className="h-4 w-4" />}
        {status === "submitting" ? t("submitting") : t("submit")}
      </button>

      {status === "badPhone" && (
        <p className="text-sm text-red-600">{t("phoneError")}</p>
      )}

      {status === "error" && (
        <p className="text-sm text-red-600">{t("sendError")}</p>
      )}
    </form>
  );
}
