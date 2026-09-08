"use client";

import { useActionState, useState } from "react";
import { createCertificateAction } from "../actions";
import { Spinner } from "@/components/Spinner";
import { formatCertificateCode, randomCertificateCode } from "@/lib/certificateCode";
import type { ServiceOption } from "@/components/BookingForm";

// Форма «новый сертификат»: клиентский компонент ради ошибки без перезагрузки
// (useActionState) и кнопки «Придумать номер» — номер потом переписывают на
// бумажный бланк от руки, поэтому он должен быть виден ДО сохранения.

const inputClass =
  "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary";

export function CertificateCreateForm({ services }: { services: ServiceOption[] }) {
  const [state, formAction, pending] = useActionState(createCertificateAction, {
    error: null,
  });
  const [code, setCode] = useState("");

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-muted">
          На чьё имя *
          <input type="text" name="clientName" required className={`mt-1 ${inputClass}`} />
        </label>
        <label className="text-xs text-muted">
          Телефон *
          <input type="tel" name="phone" required className={`mt-1 ${inputClass}`} />
        </label>
      </div>

      {/* Услуга у сертификата одна и менять её потом нельзя: номер выписан
          именно на неё, и подставится в заявку тоже она. */}
      <label className="block text-xs text-muted">
        Услуга *
        <select name="serviceId" required defaultValue="" className={`mt-1 ${inputClass}`}>
          <option value="" disabled>
            выберите услугу
          </option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-xs text-muted">
        Номер сертификата
        <div className="mt-1 flex gap-2">
          <input
            type="text"
            name="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="оставьте пустым — придумаем сами"
            className={`${inputClass} min-w-0 flex-1 uppercase`}
          />
          <button
            type="button"
            onClick={() => setCode(formatCertificateCode(randomCertificateCode()))}
            className="shrink-0 rounded-xl border border-line px-3 text-sm font-semibold text-muted transition-colors hover:border-primary"
          >
            Придумать
          </button>
        </div>
      </label>

      <label className="block text-xs text-muted">
        Заметка
        <input
          type="text"
          name="note"
          placeholder="кто подарил, повод — необязательно"
          className={`mt-1 ${inputClass}`}
        />
      </label>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
      >
        {pending && <Spinner />}
        {pending ? "Создаём…" : "Создать сертификат"}
      </button>
    </form>
  );
}
