"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Spinner } from "@/components/Spinner";
import { createClient } from "@/lib/supabase/client";

const inputClass =
  "w-full rounded-xl border border-line bg-surface px-4 py-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

// Столько же стоит в Supabase → Authentication → Password Policy. Проверяем и
// здесь, чтобы человек узнал о коротком пароле сразу, а не после отправки.
const MIN_PASSWORD = 8;

type Stage = "checking" | "ready" | "invalid" | "done";

// Ошибки Supabase приходят по-английски и техническим языком — переводим на
// человеческий. Текст может меняться от версии к версии, поэтому смотрим на
// куски, а не на строку целиком; что не узнали — показываем как есть.
//
// Причин отказа бывает СРАЗУ несколько, и Supabase сваливает их в одну строку
// («короткий, без заглавных, да ещё и из утечек»). Поэтому не выбираем первую
// подошедшую, а собираем все — иначе человек чинит пароль по одной претензии
// за попытку.
function translateError(message: string): string {
  const m = message.toLowerCase();
  const reasons: string[] = [];

  const tooShort = m.match(/at least (\d+) characters/);
  if (tooShort) reasons.push(`нужно минимум ${tooShort[1]} символов`);
  if (m.includes("character of each") || m.includes("requirements")) {
    reasons.push("нужны строчные и заглавные буквы и цифры");
  }
  if (m.includes("known to be weak") || m.includes("pwned") || m.includes("easy to guess")) {
    reasons.push("этот пароль уже встречался в утечках");
  }
  if (m.includes("different from the old")) {
    reasons.push("новый пароль совпадает со старым");
  }
  if (reasons.length) return `Пароль не подходит: ${reasons.join("; ")}.`;

  if (m.includes("session") || m.includes("jwt") || m.includes("expired")) {
    return "Ссылка устарела. Запросите новую на странице «Забыли пароль?».";
  }
  return message;
}

export function ResetPasswordForm() {
  const [stage, setStage] = useState<Stage>("checking");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Клиент Supabase создаём один раз: каждый новый — это ещё один слушатель
  // сессии, а нам тут хватает одного.
  const [supabase] = useState(createClient);

  // Разбираем ссылку из письма и превращаем токен в сессию: без неё сменить
  // пароль нельзя — Supabase меняет пароль только «текущему» пользователю.
  useEffect(() => {
    let cancelled = false;

    async function openSession() {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const query = new URLSearchParams(window.location.search);

      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      const code = query.get("code");
      const linkError = hash.get("error_description") ?? query.get("error_description");

      // Токен из адресной строки убираем сразу: он остаётся в истории браузера,
      // а по нему до истечения срока можно войти в кабинет.
      const cleanUrl = () =>
        window.history.replaceState(null, "", window.location.pathname);

      if (accessToken && refreshToken) {
        const { error: err } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        cleanUrl();
        if (cancelled) return;
        setStage(err ? "invalid" : "ready");
        return;
      }

      // Запасной вариант: если в настройках Supabase включён PKCE, вместо
      // токенов в ссылке приходит одноразовый код.
      if (code) {
        const { error: err } = await supabase.auth.exchangeCodeForSession(code);
        cleanUrl();
        if (cancelled) return;
        setStage(err ? "invalid" : "ready");
        return;
      }

      if (linkError) {
        if (!cancelled) setStage("invalid");
        return;
      }

      // Адрес без токена: либо страницу перезагрузили после того, как сессия
      // уже открылась (тогда всё в порядке), либо зашли сюда просто так.
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setStage(data.session ? "ready" : "invalid");
    }

    void openSession();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");

    if (password.length < MIN_PASSWORD) {
      setError(`Пароль слишком короткий — нужно минимум ${MIN_PASSWORD} символов.`);
      return;
    }
    if (password !== confirm) {
      setError("Пароли не совпадают.");
      return;
    }

    setError(null);
    setPending(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) {
      setError(translateError(err.message));
      setPending(false);
      return;
    }

    // Пароль сменили — и сразу выходим. Ссылка из письма открывает полноценную
    // сессию, и без этого человек оказался бы в кабинете в обход обычного
    // входа, где проверяется, не уволен ли он (left_at, миграция 0036).
    await supabase.auth.signOut();
    setPending(false);
    setStage("done");
  }

  if (stage === "checking") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner className="inline-flex h-4 w-4 items-center justify-center" />
        Проверяем ссылку…
      </div>
    );
  }

  if (stage === "invalid") {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-line bg-line/20 p-4 text-sm">
          <p className="font-semibold">Ссылка не подошла</p>
          <p className="mt-1 text-muted">
            Она действует час и срабатывает один раз — а ещё её мог «открыть» до
            вас антивирус почты. Запросите новую и переходите по ней сразу.
          </p>
        </div>
        <Link
          href="/forgot-password"
          className="inline-flex w-full items-center justify-center rounded-full bg-accent px-7 py-4 text-base font-semibold text-white transition-colors hover:bg-accent-strong"
        >
          Запросить новую ссылку
        </Link>
        <Link href="/login" className="block text-sm text-primary hover:underline">
          ← Вернуться ко входу
        </Link>
      </div>
    );
  }

  if (stage === "done") {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-line bg-line/20 p-4 text-sm">
          <p className="font-semibold">Пароль изменён</p>
          <p className="mt-1 text-muted">Теперь войдите в кабинет с новым паролем.</p>
        </div>
        <Link
          href="/login"
          className="inline-flex w-full items-center justify-center rounded-full bg-accent px-7 py-4 text-base font-semibold text-white transition-colors hover:bg-accent-strong"
        >
          Войти
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">
          Новый пароль
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={MIN_PASSWORD}
          autoComplete="new-password"
          className={inputClass}
        />
        <p className="mt-1 text-xs text-muted">
          Минимум {MIN_PASSWORD} символов: строчные и заглавные буквы и цифры.
          Пароли из известных утечек система не примет.
        </p>
      </div>

      <div>
        <label htmlFor="confirm" className="mb-1 block text-sm font-medium">
          Ещё раз
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          required
          minLength={MIN_PASSWORD}
          autoComplete="new-password"
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
        {pending ? "Сохраняем…" : "Сохранить пароль"}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
