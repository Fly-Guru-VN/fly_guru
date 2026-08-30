"use client";

import { useCallback, useEffect, useState } from "react";
import { Spinner } from "@/components/Spinner";
import { SITE_URL, SUPPORT_URL } from "@/lib/site";
import { RIDERS_MAX } from "@/lib/riders";
import {
  canCancelBooking,
  firstBookableDay,
  isBookingOpenNow,
  parseTimeText,
} from "@/lib/bookingWindow";
import type { MemberData } from "@/lib/memberCabinet";
import { bookAction, cancelAction, loadCabinetAction } from "./actions";

// Кабинет клиента — та же страница сайта, открытая внутри Telegram.
//
// Почему всё рисуется в браузере, а не на сервере: строку initData (кто пришёл)
// Telegram кладёт в страницу уже ПОСЛЕ открытия, и на сервере её в момент
// запроса ещё нет. Поэтому страница сначала грузится пустой, спрашивает у
// Telegram «кто это», отправляет ответ на сервер и только потом показывает
// данные. Проверка подписи — на сервере, здесь только показ.

// Кусочек Telegram, которым мы пользуемся. Полного описания их API у нас нет,
// поэтому объявляем ровно те поля, что трогаем.
interface TelegramWebApp {
  initData: string;
  ready: () => void;
  expand: () => void;
  openLink: (url: string) => void;
  openTelegramLink: (url: string) => void;
  HapticFeedback?: { impactOccurred: (style: string) => void };
}
declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

const TG_SCRIPT = "https://telegram.org/js/telegram-web-app.js";

// Подключаем скрипт Telegram руками, а не через <Script>: страница открывается
// и вне Telegram (тогда скрипт просто ничего не даст), и нам нужно дождаться
// его загрузки прежде, чем спрашивать initData.
function loadTelegramScript(): Promise<TelegramWebApp | null> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(null);
    if (window.Telegram?.WebApp) return resolve(window.Telegram.WebApp);

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${TG_SCRIPT}"]`);
    const done = () => resolve(window.Telegram?.WebApp ?? null);
    if (existing) {
      existing.addEventListener("load", done, { once: true });
      existing.addEventListener("error", () => resolve(null), { once: true });
      return;
    }
    const el = document.createElement("script");
    el.src = TG_SCRIPT;
    el.async = true;
    el.onload = done;
    el.onerror = () => resolve(null);
    document.head.appendChild(el);
  });
}

const card = "rounded-2xl border border-line bg-surface p-4";
const bigButton =
  "flex w-full items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-4 text-left text-base font-semibold transition-colors active:border-primary";
const inputClass =
  "w-full rounded-xl border border-line bg-surface px-4 py-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

type Screen = "home" | "book" | "list" | "history";
type Phase =
  | { kind: "loading" }
  | { kind: "outside" } // открыли не в Telegram
  | { kind: "noPhone" } // не поделился номером
  | { kind: "noClient" } // номер есть, а карточки клиента нет
  | { kind: "badAuth" }
  | { kind: "ok"; data: MemberData };

function ruDate(day: string | null): string {
  if (!day) return "дата не указана";
  const [y, m, d] = day.split("-");
  const months = "янв фев мар апр мая июн июл авг сен окт ноя дек".split(" ");
  return `${Number(d)} ${months[Number(m) - 1] ?? ""} ${y}`;
}

export function MemberApp() {
  const [initData, setInitData] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [screen, setScreen] = useState<Screen>("home");

  const refresh = useCallback(async (data: string) => {
    const res = await loadCabinetAction(data);
    if (res.state === "ok") setPhase({ kind: "ok", data: res.data });
    else if (res.state === "no_phone") setPhase({ kind: "noPhone" });
    else if (res.state === "no_client") setPhase({ kind: "noClient" });
    else setPhase({ kind: "badAuth" });
  }, []);

  useEffect(() => {
    let alive = true;
    loadTelegramScript().then((tg) => {
      if (!alive) return;
      if (!tg || !tg.initData) {
        setPhase({ kind: "outside" });
        return;
      }
      tg.ready();
      tg.expand();
      setInitData(tg.initData);
      void refresh(tg.initData);
    });
    return () => {
      alive = false;
    };
  }, [refresh]);

  const openSite = () => window.Telegram?.WebApp?.openLink(SITE_URL) ?? window.open(SITE_URL);
  const openSupport = () =>
    window.Telegram?.WebApp?.openTelegramLink(SUPPORT_URL) ?? window.open(SUPPORT_URL);

  if (phase.kind === "loading") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (phase.kind !== "ok") {
    return (
      <Message
        phase={phase}
        onSupport={openSupport}
        onSite={openSite}
      />
    );
  }

  const { data } = phase;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      {screen !== "home" && (
        <button
          type="button"
          onClick={() => setScreen("home")}
          className="mb-4 text-sm font-semibold text-muted transition-colors active:text-primary"
        >
          ← Назад
        </button>
      )}

      {screen === "home" && (
        <>
          <div className={card}>
            <p className="text-sm text-muted">{data.clientName}</p>
            {data.subscription ? (
              <>
                <p className="mt-1 text-4xl font-bold leading-none">
                  {data.subscription.left}
                  <span className="ml-2 text-base font-semibold text-muted">мин</span>
                </p>
                <p className="mt-2 text-sm text-muted">
                  из {data.subscription.totalMinutes} мин абонемента
                  {data.subscription.expiresAt
                    ? ` · до ${ruDate(data.subscription.expiresAt.slice(0, 10))}`
                    : ""}
                </p>
              </>
            ) : (
              <p className="mt-2 text-base">
                Активного абонемента нет. Записаться можно и без него — оплата на месте.
              </p>
            )}
          </div>

          <div className="mt-4 space-y-3">
            <button type="button" className={bigButton} onClick={() => setScreen("book")}>
              <span>🗓 Записаться</span>
              <span className="text-muted">›</span>
            </button>
            <button type="button" className={bigButton} onClick={() => setScreen("list")}>
              <span>📋 Мои записи</span>
              <span className="text-muted">
                {data.bookings.length > 0 ? data.bookings.length : "—"}
              </span>
            </button>
            <button type="button" className={bigButton} onClick={() => setScreen("history")}>
              <span>🕒 История</span>
              <span className="text-muted">›</span>
            </button>
            <button type="button" className={bigButton} onClick={openSite}>
              <span>🌊 Перейти на сайт</span>
              <span className="text-muted">↗</span>
            </button>
            <button type="button" className={bigButton} onClick={openSupport}>
              <span>💬 Поддержка</span>
              <span className="text-muted">↗</span>
            </button>
          </div>
        </>
      )}

      {screen === "book" && initData && (
        <BookScreen
          initData={initData}
          onSupport={openSupport}
          onDone={async () => {
            await refresh(initData);
            setScreen("list");
          }}
        />
      )}

      {screen === "list" && initData && (
        <BookingsScreen
          data={data}
          initData={initData}
          onChanged={() => refresh(initData)}
          onBook={() => setScreen("book")}
        />
      )}

      {screen === "history" && <HistoryScreen data={data} />}
    </div>
  );
}

// ── экраны-заглушки для случаев «пока не можем показать кабинет» ─────────────
function Message({
  phase,
  onSupport,
  onSite,
}: {
  phase: Phase;
  onSupport: () => void;
  onSite: () => void;
}) {
  const texts: Record<string, { title: string; body: string }> = {
    outside: {
      title: "Кабинет живёт в Telegram",
      body: "Откройте его в нашем боте: там вход без пароля — Telegram сам скажет нам, кто вы.",
    },
    noPhone: {
      title: "Остался один шаг",
      body: "Вернитесь в бота и нажмите кнопку «Поделиться номером» — по номеру мы найдём ваш абонемент. Печатать ничего не надо.",
    },
    noClient: {
      title: "Не нашли вас по номеру",
      body: "Похоже, вы у нас ещё не катались — или записаны на другой номер. Напишите в поддержку, свяжем вручную за минуту.",
    },
    badAuth: {
      title: "Не удалось вас узнать",
      body: "Закройте кабинет и откройте заново из бота. Если повторится — напишите в поддержку.",
    },
  };
  const t = texts[phase.kind] ?? texts.badAuth;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <div className={card}>
        <h1 className="text-xl font-bold">{t.title}</h1>
        <p className="mt-2 text-base text-muted">{t.body}</p>
      </div>
      <div className="mt-4 space-y-3">
        <button type="button" className={bigButton} onClick={onSupport}>
          <span>💬 Поддержка</span>
          <span className="text-muted">↗</span>
        </button>
        <button type="button" className={bigButton} onClick={onSite}>
          <span>🌊 Перейти на сайт</span>
          <span className="text-muted">↗</span>
        </button>
      </div>
    </div>
  );
}

// ── запись ───────────────────────────────────────────────────────────────────
function BookScreen({
  initData,
  onSupport,
  onDone,
}: {
  initData: string;
  onSupport: () => void;
  onDone: () => void;
}) {
  const minDay = firstBookableDay();
  const [date, setDate] = useState(minDay);
  const [time, setTime] = useState("09:00");
  const [duration, setDuration] = useState(60);
  const [riders, setRiders] = useState(1);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = duration * riders;

  const submit = async () => {
    setBusy(true);
    setError(null);
    const res = await bookAction(initData, { date, time, duration, riders, comment });
    setBusy(false);
    if (res.ok) onDone();
    else setError(res.error);
  };

  // Ночью форму даже не показываем: сервер такую заявку всё равно не примет,
  // а человеку честнее сразу дать кнопку поддержки, чем отказ после заполнения.
  if (!isBookingOpenNow()) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Записаться</h1>
        <div className={card}>
          <p className="text-base text-muted">
            Запись работает с 8:00 до 20:00. Сейчас закрыто — напишите в поддержку, вас
            оформят вручную.
          </p>
        </div>
        <button type="button" className={bigButton} onClick={onSupport}>
          <span>💬 Поддержка</span>
          <span className="text-muted">↗</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Записаться</h1>
      <p className="text-sm text-muted">
        Записываем с 8:00 до 20:00 и не позднее 20:00 предыдущего дня. Мы подтвердим
        заявку и напишем вам — время закрепляется после подтверждения.
      </p>

      <label className="block text-sm font-medium">
        День
        <input
          type="date"
          value={date}
          min={minDay}
          onChange={(e) => setDate(e.target.value)}
          className={`mt-1 ${inputClass}`}
        />
      </label>

      <label className="block text-sm font-medium">
        Время начала
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className={`mt-1 ${inputClass}`}
        />
      </label>

      <label className="block text-sm font-medium">
        Сколько минут <span className="font-normal text-muted">— на одного</span>
        <input
          type="number"
          inputMode="numeric"
          min={15}
          max={240}
          step={15}
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
          className={`mt-1 ${inputClass}`}
        />
      </label>

      <div>
        <span className="block text-sm font-medium">
          Сколько катаются <span className="font-normal text-muted">— одновременно</span>
        </span>
        <div className="mt-1 flex gap-2">
          {Array.from({ length: RIDERS_MAX }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRiders(n)}
              aria-pressed={riders === n}
              className={`flex-1 rounded-xl border py-3 text-base font-semibold transition-colors ${
                riders === n
                  ? "border-accent bg-accent text-white"
                  : "border-line bg-surface text-muted"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        {riders > 1 && (
          <p className="mt-2 text-sm text-muted">
            С абонемента спишется <b>{total} мин</b> ({duration} × {riders}) — минуты идут на
            каждого катающегося.
          </p>
        )}
      </div>

      <label className="block text-sm font-medium">
        Пожелания <span className="font-normal text-muted">— необязательно</span>
        <input
          type="text"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="кто ещё катается, снаряжение…"
          className={`mt-1 ${inputClass}`}
        />
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-7 py-4 text-base font-semibold text-white transition-colors active:bg-accent-strong disabled:opacity-60"
      >
        {busy && <Spinner />}
        {busy ? "Отправляем…" : "Отправить запись"}
      </button>
    </div>
  );
}

// ── мои записи ───────────────────────────────────────────────────────────────
function BookingsScreen({
  data,
  initData,
  onChanged,
  onBook,
}: {
  data: MemberData;
  initData: string;
  onChanged: () => void;
  onBook: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cancel = async (id: string) => {
    setBusyId(id);
    setError(null);
    const res = await cancelAction(initData, id);
    setBusyId(null);
    if (res.ok) onChanged();
    else setError(res.error);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Мои записи</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {data.bookings.length === 0 && (
        <div className={card}>
          <p className="text-base text-muted">Записей пока нет.</p>
          <button
            type="button"
            onClick={onBook}
            className="mt-3 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white"
          >
            Записаться
          </button>
        </div>
      )}

      {data.bookings.map((b) => {
        const canCancel = canCancelBooking(b.date, b.time);
        return (
          <div key={b.id} className={card}>
            <p className="text-base font-semibold">
              {ruDate(b.date)}
              {parseTimeText(b.time) ? `, ${parseTimeText(b.time)}` : ""}
            </p>
            <p className="mt-1 text-sm text-muted">
              {b.status === "confirmed" ? "Подтверждена" : "Ждёт подтверждения"}
              {b.serviceName ? ` · ${b.serviceName}` : ""}
            </p>
            {b.note && <p className="mt-1 text-sm text-muted">{b.note}</p>}
            <button
              type="button"
              onClick={() => cancel(b.id)}
              disabled={!canCancel || busyId === b.id}
              className="mt-3 inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-semibold text-muted transition-colors active:border-primary disabled:opacity-50"
            >
              {busyId === b.id && <Spinner />}
              {canCancel ? "Отменить" : "Отменить уже нельзя"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── история ──────────────────────────────────────────────────────────────────
function HistoryScreen({ data }: { data: MemberData }) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">История</h1>
      {data.history.length === 0 && (
        <div className={card}>
          <p className="text-base text-muted">Пока пусто — первая каталка впереди.</p>
        </div>
      )}
      {data.history.map((v, i) => (
        <div key={`${v.date}-${i}`} className={card}>
          <p className="text-base font-semibold">{ruDate(v.date)}</p>
          <p className="mt-1 text-sm text-muted">
            {v.minutes ? `${v.minutes} мин с абонемента` : (v.serviceName ?? "занятие")}
          </p>
          {v.note && <p className="mt-1 text-sm text-muted">{v.note}</p>}
        </div>
      ))}
    </div>
  );
}
