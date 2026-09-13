"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { contacts } from "@/content/contacts";
import { trackEvent } from "@/lib/analytics";
import { isValidPhone } from "@/lib/phone";
import { formatUsd, resolveShopSelection, type ShopSelection } from "@/lib/shop";
import { AppIcon, type AppName } from "../AppIcon";
import { Spinner } from "../Spinner";

// Окно «Купить» в магазине. Корзины и оплаты на сайте нет намеренно: доска
// стоит $11–15 тыс., итоговую цену во Вьетнаме, наличие и сроки всё равно
// обсуждают лично. Поэтому «Купить» = связаться, двумя путями:
//   1) мессенджер — WhatsApp с уже написанным текстом про выбранную доску;
//   2) форма «Перезвоните мне» — уходит сообщением в рабочий чат школы.
// Устройство панели (затемнение, лист снизу на телефоне, Esc, блок скролла)
// повторяет BookingModal, чтобы оба окна вели себя одинаково.

const MESSENGERS = ["WhatsApp", "Telegram", "Zalo"] as const;

const inputClass =
  "w-full rounded-xl border border-line bg-surface px-4 py-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

type Status = "idle" | "submitting" | "error" | "badPhone" | "sent";

export function ShopInquiryModal({
  selection,
  image,
  onClose,
}: {
  selection: ShopSelection;
  image?: string; // фото выбранного исполнения — чтобы гость видел, про что пишет
  onClose: () => void;
}) {
  const t = useTranslations("ShopInquiry");
  const locale = useLocale();
  const panelRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [phone, setPhone] = useState("");

  const item = resolveShopSelection(selection);
  const productKey = item?.productId ?? "consult";
  const phoneBad = phone.trim().length > 0 && !isValidPhone(phone);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Фокус не ставим в поле: первым делом гость выбирает между мессенджером
    // и формой, а на телефоне фокус в поле сразу выдвинул бы клавиатуру.
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Готовый текст для мессенджера — на языке гостя. Подставить его умеет
  // только WhatsApp (?text=); Telegram и Zalo по номеру открывают пустой чат.
  const messageText = item ? t("messageText", { item: item.title }) : t("consultText");
  const channels: { app: AppName; name: string; href: string }[] = [
    {
      app: "whatsapp",
      name: "WhatsApp",
      href: `${contacts.phone.whatsapp}?text=${encodeURIComponent(messageText)}`,
    },
    { app: "telegram", name: "Telegram", href: contacts.telegram },
    { app: "zalo", name: "Zalo", href: contacts.zalo },
  ];

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isValidPhone(phone)) {
      setStatus("badPhone");
      return;
    }
    setStatus("submitting");
    const data = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/shop-inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...selection,
          clientName: String(data.get("clientName") ?? ""),
          contact: phone,
          messenger: String(data.get("messenger") ?? ""),
          comment: String(data.get("comment") ?? ""),
          locale,
          honeypot: String(data.get("company") ?? ""),
        }),
      });
      if (!res.ok) throw new Error("request failed");
      trackEvent("shop_inquiry_sent", { product: productKey });
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("title")}
      onClick={onClose}
      className="animate-fade-in fixed inset-0 z-[100] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-up sm:animate-pop-in relative flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl border border-line bg-surface shadow-xl outline-none sm:max-h-[88dvh] sm:rounded-3xl"
      >
        <div className="flex items-center justify-between gap-3 px-6 pb-2 pt-6 sm:px-8 sm:pt-8">
          <h2 className="text-2xl font-bold">
            {status === "sent" ? t("successTitle") : t("title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line text-muted transition-colors hover:border-primary hover:text-primary"
          >
            ✕
          </button>
        </div>

        <div className="scroll-soft scroll-dim mb-2 mr-2 min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4 pl-6 pr-4 pt-2 sm:mb-3 sm:mr-3 sm:pb-5 sm:pl-8 sm:pr-5">
          {/* Про что разговор: фото, название, цена. Без этого окно выглядит
              как общая форма обратной связи, и гость не уверен, что мы поймём,
              какую доску он выбрал. */}
          <div className="flex items-center gap-4 rounded-2xl border border-line bg-white p-3">
            {image && (
              <Image
                src={image}
                alt=""
                width={160}
                height={160}
                className="h-16 w-16 shrink-0 rounded-xl object-contain"
              />
            )}
            <div className="min-w-0">
              <p className="font-semibold leading-snug">{item?.title ?? t("consultItem")}</p>
              {item && (
                <p className="mt-0.5 text-sm text-muted">{formatUsd(item.priceUsd)}</p>
              )}
            </div>
          </div>

          {status === "sent" ? (
            <div className="py-6">
              <p className="text-muted">{t("successText")}</p>
              <button
                type="button"
                onClick={onClose}
                className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-primary px-7 py-4 text-base font-semibold text-white transition-colors hover:bg-primary-strong sm:w-auto"
              >
                {t("done")}
              </button>
            </div>
          ) : (
            <>
              <p className="mt-5 text-sm font-semibold">{t("messengersTitle")}</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {channels.map((c) => (
                  <a
                    key={c.app}
                    href={c.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() =>
                      trackEvent("contact_click", { channel: c.app, place: "shop", product: productKey })
                    }
                    className="flex flex-col items-center gap-1.5 rounded-2xl border border-line bg-surface px-2 py-3 text-sm font-semibold transition-colors hover:border-primary"
                  >
                    <AppIcon app={c.app} className="h-9 w-9" />
                    {c.name}
                  </a>
                ))}
              </div>

              <div className="my-5 flex items-center gap-3 text-sm text-muted">
                <span className="h-px flex-1 bg-line" />
                {t("or")}
                <span className="h-px flex-1 bg-line" />
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Поле-ловушка для ботов, как в форме записи. */}
                <div className="absolute left-[-9999px]" aria-hidden="true">
                  <label>
                    {t("honeypot")}
                    <input type="text" name="company" tabIndex={-1} autoComplete="off" />
                  </label>
                </div>

                <div>
                  <label htmlFor="shopClientName" className="mb-1 block text-sm font-medium">
                    {t("name")} <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="shopClientName"
                    name="clientName"
                    type="text"
                    autoComplete="name"
                    required
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="shopContact" className="mb-1 block text-sm font-medium">
                    {t("phone")} <span className="text-red-600">*</span>
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      id="shopContact"
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
                    <select
                      name="messenger"
                      defaultValue={MESSENGERS[0]}
                      aria-label={t("messenger")}
                      className={`${inputClass} sm:w-40`}
                    >
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
                  <label htmlFor="shopComment" className="mb-1 block text-sm font-medium">
                    {t("comment")}
                  </label>
                  <textarea
                    id="shopComment"
                    name="comment"
                    rows={3}
                    placeholder={t("commentPlaceholder")}
                    className={inputClass}
                  />
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
                {status === "error" && <p className="text-sm text-red-600">{t("sendError")}</p>}
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
