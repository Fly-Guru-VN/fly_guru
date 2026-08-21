"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Spinner } from "@/components/Spinner";
import {
  requestPasswordResetAction,
  type ResetRequestState,
} from "../login/actions";

const inputClass =
  "w-full rounded-xl border border-line bg-surface px-4 py-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<ResetRequestState, FormData>(
    requestPasswordResetAction,
    { error: null, sent: false },
  );

  // Письмо ушло — форму убираем, чтобы не жали кнопку по второму разу: каждая
  // новая ссылка гасит предыдущую, и человек рискует открыть уже мёртвую.
  if (state.sent) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-line bg-line/20 p-4 text-sm">
          <p className="font-semibold">Письмо отправлено</p>
          <p className="mt-1 text-muted">
            Если такой аккаунт есть, письмо со ссылкой уже в почте. Ссылка
            действует час и срабатывает один раз. Не пришло за пару минут —
            загляните в «Спам».
          </p>
        </div>
        <Link href="/login" className="block text-sm text-primary hover:underline">
          ← Вернуться ко входу
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="identifier" className="mb-1 block text-sm font-medium">
          Email или телефон
        </label>
        <input
          id="identifier"
          name="identifier"
          type="text"
          required
          autoComplete="username"
          placeholder="you@example.com или +84…"
          className={inputClass}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-7 py-4 text-base font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
      >
        {pending && (
          <Spinner />
        )}
        {pending ? "Отправляем…" : "Отправить ссылку"}
      </button>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <Link href="/login" className="block text-sm text-primary hover:underline">
        ← Вернуться ко входу
      </Link>
    </form>
  );
}
