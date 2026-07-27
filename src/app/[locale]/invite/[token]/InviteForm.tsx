"use client";

import { useActionState } from "react";
import { acceptInviteAction } from "./actions";
import { Spinner } from "@/components/Spinner";

// Форма «придумайте пароль». Клиентский компонент ради ошибок без перезагрузки.

const inputClass =
  "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary";

export function InviteForm({
  token,
  phone,
}: {
  token: string;
  phone: string | null; // цифры телефона клиента; null — телефона нет, email обязателен
}) {
  const [state, formAction, pending] = useActionState(acceptInviteAction, {
    error: null,
  });

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="token" value={token} />

      <label className="block text-xs text-muted">
        Email {phone ? "(необязательно)" : ""}
        <input
          type="email"
          name="email"
          required={!phone}
          placeholder={phone ? "если хотите входить по email" : "для входа в кабинет"}
          className={`mt-1 ${inputClass}`}
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-muted">
          Пароль
          <input
            type="password"
            name="password"
            required
            minLength={6}
            autoComplete="new-password"
            className={`mt-1 ${inputClass}`}
          />
        </label>
        <label className="text-xs text-muted">
          Ещё раз
          <input
            type="password"
            name="password2"
            required
            minLength={6}
            autoComplete="new-password"
            className={`mt-1 ${inputClass}`}
          />
        </label>
      </div>

      <p className="text-xs text-muted">
        {phone
          ? `Входить сможете по номеру ${phone}${" "}или по email, если укажете.`
          : "Входить будете по этому email."}
      </p>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-accent px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
      >
        {pending && <Spinner className="inline-flex items-center justify-center gap-2 h-4 w-4" />}
        {pending ? "Создаём кабинет…" : "Создать кабинет"}
      </button>
    </form>
  );
}
