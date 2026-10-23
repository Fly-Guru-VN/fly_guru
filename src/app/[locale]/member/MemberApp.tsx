"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import { Spinner } from "@/components/Spinner";
import { ServicePicker } from "@/components/ServicePicker";
import type { ServiceOption } from "@/components/BookingForm";
import { CLIENT_BOT_URL, SITE_URL, SUPPORT_URL } from "@/lib/site";
import { RIDERS_MAX } from "@/lib/riders";
import {
  canCancelBooking,
  CANCEL_WINDOW_MIN,
  firstBookableDay,
  isBookingOpenNow,
  parseTimeText,
} from "@/lib/bookingWindow";
import type { MemberData } from "@/lib/memberCabinet";
import {
  FRIEND_SUBSCRIPTION_DISCOUNT,
  REFERRER_REWARD_BY_SERVICE,
} from "@/lib/referralTerms";
import { vnDay } from "@/lib/dates";
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
  // Появилось в Bot API 7.7 и есть не у всех клиентов — отсюда «?».
  // Пока свайпы включены, Telegram перехватывает движение пальца по экрану и
  // таскает само окно приложения; для человека это выглядит как «кабинет ездит».
  disableVerticalSwipes?: () => void;
  // Цвета рамки, которую рисует сам Telegram (6.1+ и 7.10+). Красим её под
  // кабинет, чтобы шапка и низ окна не спорили с морем на экране.
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  setBottomBarColor?: (color: string) => void;
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

// Цвета «моря» кабинета. Повторяются в классах ниже буквально: Tailwind не
// собирает классы из переменных, поэтому константы нужны только для Telegram.
const TG_HEADER_COLOR = "#0b4f63";
const SHELL_BG = "#e3f2f6";
const SEA_DEEP = "#063a4d";

const card =
  "rounded-[22px] border border-white bg-white/90 p-4 shadow-[0_8px_24px_rgba(11,79,99,0.08)]";
const screenTitle = "text-2xl font-extrabold text-ink";
const inputClass =
  "w-full rounded-xl border border-line bg-surface px-4 py-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

type Screen = "home" | "book" | "list" | "history" | "invite";
type Phase =
  | { kind: "loading" }
  | { kind: "outside" } // открыли не в Telegram
  | { kind: "noPhone" } // не поделился номером
  | { kind: "noClient" } // номер есть, а карточки клиента нет
  | { kind: "badAuth" }
  | { kind: "serverError" }
  | { kind: "ok"; data: MemberData };

// Часы, которые тикают раз в минуту.
//
// Зачем: можно ли ещё отменить — считается от «сейчас». Открытый и забытый на
// столе кабинет считал это один раз, при отрисовке: час до занятия давно
// прошёл, а кнопка «Отменить» так и оставалась живой. Нажатие сервер, конечно,
// отбивал — но человеку показывали кнопку, которая уже ничего не делает.
function useMinuteTick(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function ruDate(day: string | null): string {
  if (!day) return "дата не указана";
  const [y, m, d] = day.split("-");
  const months = "янв фев мар апр мая июн июл авг сен окт ноя дек".split(" ");
  return `${Number(d)} ${months[Number(m) - 1] ?? ""} ${y}`;
}

export function MemberApp({ services }: { services: ServiceOption[] }) {
  const [initData, setInitData] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [screen, setScreen] = useState<Screen>("home");

  const refresh = useCallback(async (data: string) => {
    try {
      const res = await loadCabinetAction(data);
      if (res.state === "ok") setPhase({ kind: "ok", data: res.data });
      else if (res.state === "no_phone") setPhase({ kind: "noPhone" });
      else if (res.state === "no_client") setPhase({ kind: "noClient" });
      else setPhase({ kind: "badAuth" });
    } catch (error) {
      console.error("[member] cabinet load error:", error);
      setPhase({ kind: "serverError" });
    }
  }, []);

  // Экран кабинета не должен оттягиваться и пружинить: внутри Telegram это
  // читается как «приложение ездит». overscroll-behavior запрещает и оттяг за
  // край, и передачу прокрутки наружу — тому самому окну, которое Telegram
  // рисует вокруг нас. Значение возвращаем при уходе со страницы: на обычных
  // страницах сайта пружина уместна.
  useEffect(() => {
    const root = document.documentElement;
    const was = root.style.overscrollBehavior;
    root.style.overscrollBehavior = "none";
    return () => {
      root.style.overscrollBehavior = was;
    };
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
      // Свайпы, которыми Telegram двигает окно приложения, кабинету только
      // мешают: пролистывать здесь нечего, а экран от них уезжает.
      tg.disableVerticalSwipes?.();
      tg.setHeaderColor?.(TG_HEADER_COLOR);
      tg.setBackgroundColor?.(SHELL_BG);
      tg.setBottomBarColor?.(SEA_DEEP);
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
  // Сюда жмут только из обычного браузера (в телеграме бот уже открыт), поэтому
  // на деле сработает window.open — но ветку через WebApp оставляем, чтобы
  // кнопка вела себя одинаково, где бы её ни показали.
  const openBot = () =>
    window.Telegram?.WebApp?.openTelegramLink(CLIENT_BOT_URL) ?? window.open(CLIENT_BOT_URL);

  if (phase.kind === "loading") {
    return (
      <Shell onBot={openBot}>
        <Hero />
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      </Shell>
    );
  }

  if (phase.kind !== "ok") {
    return (
      <Shell onBot={openBot}>
        <Message
          phase={phase}
          onSupport={openSupport}
          onSite={openSite}
          onBot={openBot}
        />
      </Shell>
    );
  }

  const { data } = phase;
  const bookingsCount = data.bookings.length;

  if (screen === "home") {
    return (
      <Shell onBot={openBot}>
        <Hero />
        <div className="relative z-10 -mt-16 space-y-3 px-4">
          <ClientCard data={data} />
          <MenuItem
            icon={<CalendarIcon />}
            tone="teal"
            title="Записаться"
            hint="Выбрать занятие и забронировать"
            highlight
            onClick={() => setScreen("book")}
          />
          <MenuItem
            icon={<ClipboardIcon />}
            tone="orange"
            title="Мои записи"
            hint={
              bookingsCount > 0
                ? `Ближайших броней: ${bookingsCount}`
                : "Ближайшие занятия и брони"
            }
            badge={bookingsCount > 0 ? bookingsCount : undefined}
            onClick={() => setScreen("list")}
          />
          <MenuItem
            icon={<ClockIcon />}
            tone="teal"
            title="История"
            hint="Прошедшие занятия"
            onClick={() => setScreen("history")}
          />
          <MenuItem
            icon={<GiftIcon />}
            tone="orange"
            title="Пригласить друга"
            hint="Получите бонусы за друзей"
            onClick={() => setScreen("invite")}
          />
          <MenuItem
            icon={<WaveIcon />}
            tone="sky"
            title="Перейти на сайт"
            hint="Узнать больше о FlyGuru"
            external
            onClick={openSite}
          />
          <MenuItem
            icon={<ChatIcon />}
            tone="violet"
            title="Поддержка"
            hint="Мы всегда на связи"
            external
            onClick={openSupport}
          />
        </div>
      </Shell>
    );
  }

  return (
    <Shell onBot={openBot}>
      <div className="relative z-10 px-4 pt-4">
        <button
          type="button"
          onClick={() => setScreen("home")}
          className="mb-4 inline-flex items-center gap-1 rounded-full bg-white/90 py-2 pl-3 pr-4 text-sm font-semibold text-primary-strong shadow-[0_4px_14px_rgba(11,79,99,0.10)] transition-colors active:bg-white"
        >
          <ChevronIcon className="h-4 w-4 rotate-180" />
          Назад
        </button>

      {screen === "book" && initData && (
        <BookScreen
          initData={initData}
          services={services}
          hasSubscription={data.subscription !== null}
          bonusLeft={data.referral.bonusLeft}
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

      {screen === "invite" && <InviteScreen data={data} />}
      </div>
    </Shell>
  );
}

// ── экраны-заглушки для случаев «пока не можем показать кабинет» ─────────────
function Message({
  phase,
  onSupport,
  onSite,
  onBot,
}: {
  phase: Phase;
  onSupport: () => void;
  onSite: () => void;
  onBot: () => void;
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
      body: "Похоже, ваш Telegram заведён не на тот номер, что вы оставляли при записи. Попросите у инструктора личную ссылку для входа: нажмёте на неё, и кабинет откроется.",
    },
    badAuth: {
      title: "Не удалось вас узнать",
      body: "Закройте кабинет и откройте заново из бота. Если повторится — напишите в поддержку.",
    },
    serverError: {
      title: "Кабинет временно недоступен",
      body: "Не удалось получить данные. Попробуйте обновить через минуту; если повторится — напишите в поддержку.",
    },
  };
  const t = texts[phase.kind] ?? texts.badAuth;

  return (
    <>
      <Hero />
      <div className="relative z-10 -mt-16 space-y-3 px-4">
        <div className={card}>
          <h1 className="text-xl font-bold text-ink">{t.title}</h1>
          <p className="mt-2 text-base text-muted">{t.body}</p>
        </div>
        {/* Только на экране «зашёл мимо телеграма»: в остальных случаях человек
            уже внутри бота, и вести его в бота из бота незачем. */}
        {phase.kind === "outside" && (
          <MenuItem
            icon={<TelegramIcon className="h-6 w-6" />}
            tone="sky"
            title="Открыть бота"
            hint="Вход без пароля"
            external
            highlight
            onClick={onBot}
          />
        )}
        <MenuItem
          icon={<ChatIcon />}
          tone="violet"
          title="Поддержка"
          hint="Мы всегда на связи"
          external
          onClick={onSupport}
        />
        <MenuItem
          icon={<WaveIcon />}
          tone="sky"
          title="Перейти на сайт"
          hint="Узнать больше о FlyGuru"
          external
          onClick={onSite}
        />
      </div>
    </>
  );
}

// ── запись ───────────────────────────────────────────────────────────────────

// Что подставить в выпадайку услуг по умолчанию. В кабинете сидят те, кто уже
// катался, и чаще всего им нужно самостоятельное катание; нет такой услуги в
// базе — берём первую из списка (он уже отсортирован, lib/serviceOrder).
const DEFAULT_MEMBER_SERVICE_CODE = "rental";

function defaultServiceId(services: ServiceOption[]): string {
  return (
    services.find((s) => s.code === DEFAULT_MEMBER_SERVICE_CODE)?.id ??
    services[0]?.id ??
    ""
  );
}

type BookMode = "sub" | "bonus" | "service";

function BookScreen({
  initData,
  services,
  hasSubscription,
  bonusLeft,
  onSupport,
  onDone,
}: {
  initData: string;
  services: ServiceOption[];
  hasSubscription: boolean;
  bonusLeft: number;
  onSupport: () => void;
  onDone: () => void;
}) {
  const minDay = firstBookableDay();
  const [date, setDate] = useState(minDay);
  const [time, setTime] = useState("09:00");
  // На что записываемся. «По абонементу» — это минуты и число катающихся, как
  // было раньше; иначе выбирается конкретная услуга и минуты ни при чём. Без
  // абонемента развилки нет — сразу услуги. Пустой список услуг (база не
  // ответила) тоже уводит в минуты: иначе человек упрётся в пустую выпайдайку
  // и не запишется вовсе.
  const canPickService = services.length > 0;
  // Третий режим — «Бонусные»: те же минуты и катающиеся, но с баланса за
  // приглашённых друзей (0063). Есть только у того, у кого этот баланс есть.
  const [mode, setMode] = useState<BookMode>(
    hasSubscription || !canPickService ? "sub" : "service",
  );
  const bySubscription = mode !== "service"; // минуты вместо услуги
  const modes: { key: BookMode; label: string }[] = [
    ...(hasSubscription ? [{ key: "sub" as const, label: "По абонементу" }] : []),
    ...(bonusLeft > 0 ? [{ key: "bonus" as const, label: "Бонусные" }] : []),
    ...(canPickService ? [{ key: "service" as const, label: "Другое занятие" }] : []),
  ];
  const [serviceId, setServiceId] = useState(() => defaultServiceId(services));
  const [duration, setDuration] = useState(60);
  const [riders, setRiders] = useState(1);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = duration * riders;

  const submit = async () => {
    setBusy(true);
    setError(null);
    const res = await bookAction(initData, {
      date,
      time,
      duration,
      riders,
      comment,
      // null — «катание по абонементу»: услуги как таковой нет, есть минуты.
      serviceId: bySubscription ? null : serviceId,
      bonus: mode === "bonus",
    });
    setBusy(false);
    if (res.ok) onDone();
    else setError(res.error);
  };

  // Ночью форму даже не показываем: сервер такую заявку всё равно не примет,
  // а человеку честнее сразу дать кнопку поддержки, чем отказ после заполнения.
  if (!isBookingOpenNow()) {
    return (
      <div className="space-y-4">
        <h1 className={screenTitle}>Записаться</h1>
        <div className={card}>
          <p className="text-base text-muted">
            Запись работает с 8:00 до 20:00. Сейчас закрыто — напишите в поддержку, вас
            оформят вручную.
          </p>
        </div>
        <MenuItem
          icon={<ChatIcon />}
          tone="violet"
          title="Поддержка"
          hint="Оформим запись вручную"
          external
          onClick={onSupport}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className={screenTitle}>Записаться</h1>
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

      {/* Развилка нужна только тем, у кого есть что списывать: без абонемента
          и без бонусных минут выбор между «минутами» и услугой человеку ничего
          не объясняет. */}
      {modes.length > 1 && (
        <div>
          <span className="block text-sm font-medium">На что записываемся</span>
          <div className="mt-1 flex gap-2">
            {modes.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setMode(opt.key)}
                aria-pressed={mode === opt.key}
                className={`flex-1 rounded-xl border py-3 font-semibold transition-colors ${
                  modes.length > 2 ? "text-sm" : "text-base"
                } ${
                  mode === opt.key
                    ? "border-accent bg-accent text-white"
                    : "border-line bg-surface text-muted"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {mode === "bonus" && (
            <p className="mt-2 text-sm text-muted">
              Бонусных минут: <b>{bonusLeft}</b> — за приглашённых друзей.
            </p>
          )}
        </div>
      )}

      {!bySubscription && (
        <ServicePicker services={services} value={serviceId} onChange={setServiceId} />
      )}

      {bySubscription && (
        <>
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
                {mode === "bonus" ? "С бонусного баланса" : "С абонемента"} спишется{" "}
                <b>{total} мин</b> ({duration} × {riders}) — минуты идут на каждого
                катающегося.
              </p>
            )}
          </div>
        </>
      )}

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
  const now = useMinuteTick();

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
      <h1 className={screenTitle}>Мои записи</h1>
      {/* Правило отмены — на виду, а не только в отказе после нажатия: человек
          должен узнать про час ДО того, как соберётся отменять. */}
      {data.bookings.length > 0 && (
        <p className="rounded-2xl border border-line bg-primary/5 px-4 py-3 text-sm text-muted">
          ⏳ Отменить запись можно не позднее чем за{" "}
          {CANCEL_WINDOW_MIN >= 60
            ? `${CANCEL_WINDOW_MIN / 60} ч`
            : `${CANCEL_WINDOW_MIN} мин`}{" "}
          до начала. Позже — напишите в поддержку, отменим вручную.
        </p>
      )}
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
        const canCancel = canCancelBooking(b.date, b.time, now);
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
            {!canCancel && (
              <p className="mt-2 text-sm text-muted">
                До начала меньше часа. Если планы изменились — напишите в
                поддержку.
              </p>
            )}
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
      <h1 className={screenTitle}>История</h1>
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

// ── пригласить друга (0063) ──────────────────────────────────────────────────
// Вкладку видят все клиенты, ссылку — только члены клуба (купил абонемент).
// Остальным честно объясняем, когда она появится, вместо пустого экрана.
function InviteScreen({ data }: { data: MemberData }) {
  const { referral } = data;
  const [copied, setCopied] = useState(false);

  const discount = FRIEND_SUBSCRIPTION_DISCOUNT.toLocaleString("ru-RU");
  const shareText = `Покатайся на электрофойле во FlyGuru 🌊 По моей ссылке абонемент дешевле на ${discount} ₫`;

  const copy = async () => {
    if (!referral.link) return;
    try {
      await navigator.clipboard.writeText(referral.link);
      setCopied(true);
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred("light");
    } catch {
      // Буфер обмена в webview бывает закрыт — тогда ссылку видно на экране,
      // её можно выделить руками или отправить кнопкой «Поделиться».
    }
  };
  const share = () => {
    if (!referral.link) return;
    const url = `https://t.me/share/url?url=${encodeURIComponent(referral.link)}&text=${encodeURIComponent(shareText)}`;
    if (window.Telegram?.WebApp) window.Telegram.WebApp.openTelegramLink(url);
    else window.open(url);
  };

  return (
    <div className="space-y-4">
      <h1 className={screenTitle}>Пригласить друга</h1>

      <div className={card}>
        {/* Условия с 09.10.2026 (lib/referralTerms): награду решает первая
            покупка нового друга, другу — скидка только на абонемент. */}
        <p className="text-base">
          Новый друг пришёл по вашей ссылке и оплатил — вам бонусные минуты:
        </p>
        <ul className="mt-2 space-y-1 text-base">
          <li>
            абонемент — <b>+{REFERRER_REWARD_BY_SERVICE.subscription} мин</b>
          </li>
          <li>
            базовое обучение — <b>+{REFERRER_REWARD_BY_SERVICE["basic-adult"]} мин</b>
          </li>
          <li>
            тандем — <b>+{REFERRER_REWARD_BY_SERVICE["tandem-adult"]} мин</b>
          </li>
        </ul>
        <p className="mt-2 text-base">
          Другу — <b>−{discount} ₫</b> на абонемент, если он сразу берёт абонемент.
        </p>
        <p className="mt-2 text-sm text-muted">
          Считается первая запись друга: детские занятия, прокат и экскурсии
          минут не дают.
        </p>
      </div>

      {referral.link ? (
        <>
          <div className={card}>
            <p className="text-sm text-muted">Ваша ссылка</p>
            <p className="mt-1 break-all text-base font-semibold">{referral.link}</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={share}
              className="flex-1 rounded-full bg-accent px-4 py-3 text-base font-semibold text-white transition-colors active:bg-accent-strong"
            >
              Поделиться
            </button>
            <button
              type="button"
              onClick={copy}
              className="flex-1 rounded-full border border-line bg-surface px-4 py-3 text-base font-semibold text-muted transition-colors active:border-primary"
            >
              {copied ? "Скопировано ✓" : "Скопировать"}
            </button>
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-accent/40 bg-accent/10 p-4 text-base">
          Ссылка откроется, когда вы купите абонемент и станете членом клуба.
        </div>
      )}

      <div className={card}>
        <p className="text-sm text-muted">Бонусных минут</p>
        <p className="mt-1 text-3xl font-bold leading-none">
          {referral.bonusLeft}
          <span className="ml-2 text-base font-semibold text-muted">мин</span>
        </p>
        <p className="mt-2 text-sm text-muted">
          Потратить: «Записаться» → «Бонусные». Минуты не сгорают.
        </p>
      </div>

      {referral.invited.length > 0 && (
        <div className={card}>
          <p className="text-sm font-semibold">Кого вы пригласили</p>
          <ul className="mt-2 space-y-2">
            {referral.invited.map((f, i) => (
              <li key={`${f.since}-${i}`} className="flex items-baseline justify-between gap-3">
                <span>
                  {f.name}
                  <span className="ml-2 text-sm text-muted">
                    {ruDate(vnDay(f.since))}
                  </span>
                </span>
                <span
                  className={`shrink-0 text-sm ${f.rewardMinutes > 0 ? "font-semibold text-accent-strong" : "text-muted"}`}
                >
                  {f.rewardMinutes > 0 ? `+${f.rewardMinutes} мин` : "пока без минут"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── оформление: море, герой, карточки ────────────────────────────────────────

// Фон всего кабинета: светлая вода сверху и глубокое море в подвале. Подвал
// прижат к низу, даже когда экран почти пустой (например, «нет записей»).
function Shell({ children, onBot }: { children: ReactNode; onBot: () => void }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col overflow-x-hidden bg-gradient-to-b from-[#e3f2f6] via-[#f1f8fa] to-[#e6f2f5]">
      <div className="flex-1 pb-12">{children}</div>
      <SeaFooter onBot={onBot} />
    </div>
  );
}

function Hero() {
  return (
    <header className="relative h-[280px] overflow-hidden">
      <Image
        src="/media/photo/member-hero.webp"
        alt=""
        fill
        priority
        sizes="(max-width: 448px) 100vw, 448px"
        // Гуру на фойле стоит справа — его и держим в кадре на узком экране,
        // пальмы и небо слева остаются под логотип.
        className="object-cover object-[0%_50%]"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-[#073f52]/65 via-[#073f52]/20 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-b from-transparent to-[#e3f2f6]" />
      <div className="relative flex items-center gap-3 px-4 pt-7">
        <Image
          src="/brand/flyguru-logo.jpg"
          alt="FlyGuru"
          width={68}
          height={68}
          className="h-[68px] w-[68px] shrink-0 rounded-full shadow-[0_6px_20px_rgba(0,0,0,0.25)] ring-4 ring-white/80"
        />
        <div>
          <p className="text-[34px] font-extrabold leading-none text-white [text-shadow:0_2px_12px_rgba(0,40,60,0.45)]">
            FlyGuru
          </p>
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/90 [text-shadow:0_1px_6px_rgba(0,40,60,0.5)]">
            Настоящий полёт!
          </p>
        </div>
      </div>
    </header>
  );
}

function ClientCard({ data }: { data: MemberData }) {
  const sub = data.subscription;
  return (
    <div className={`relative overflow-hidden ${card} py-5`}>
      <WaveDecor className="pointer-events-none absolute -bottom-6 -right-8 h-24 w-64 text-primary/10" />
      <div className="relative flex items-center gap-4">
        <Image
          src="/brand/flyguru-logo.jpg"
          alt=""
          width={68}
          height={68}
          className="h-[68px] w-[68px] shrink-0 rounded-full"
        />
        <div className="min-w-0">
          <p className="truncate text-xl font-bold text-ink">{data.clientName}</p>
          {sub ? (
            <>
              <p className="mt-1 text-[15px] text-muted">
                <b className="text-2xl font-extrabold text-primary-strong">{sub.left}</b> мин
                из {sub.totalMinutes}
              </p>
              {sub.expiresAt && (
                <p className="text-sm text-muted">
                  абонемент до {ruDate(sub.expiresAt.slice(0, 10))}
                </p>
              )}
            </>
          ) : (
            <p className="mt-1 text-[15px] leading-snug text-muted">
              Активного абонемента нет. Записаться можно и без него — оплата на месте.
            </p>
          )}
          {data.referral.bonusLeft > 0 && (
            <p className="mt-1 text-sm font-semibold text-accent-strong">
              + {data.referral.bonusLeft} бонусных мин за друзей
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

type Tone = "teal" | "orange" | "sky" | "violet";
const TONES: Record<Tone, string> = {
  teal: "bg-primary/10 text-primary",
  orange: "bg-accent/10 text-accent",
  sky: "bg-sky-500/10 text-sky-600",
  violet: "bg-violet-500/10 text-violet-500",
};

function MenuItem({
  icon,
  tone,
  title,
  hint,
  onClick,
  badge,
  external = false,
  highlight = false,
}: {
  icon: ReactNode;
  tone: Tone;
  title: string;
  hint: string;
  onClick: () => void;
  badge?: number;
  external?: boolean;
  highlight?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-[22px] border bg-white/90 px-3.5 py-3.5 text-left shadow-[0_6px_18px_rgba(11,79,99,0.07)] transition-colors active:bg-white ${
        highlight ? "border-primary/60" : "border-white"
      }`}
    >
      <span
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${TONES[tone]}`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-bold leading-tight text-ink">{title}</span>
        <span className="mt-0.5 block text-[14px] leading-snug text-muted">{hint}</span>
      </span>
      {badge !== undefined && (
        <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-accent px-2 text-xs font-bold text-white">
          {badge}
        </span>
      )}
      {external ? (
        <ExternalIcon className="h-5 w-5 shrink-0 text-primary" />
      ) : (
        <ChevronIcon className="h-5 w-5 shrink-0 text-primary" />
      )}
    </button>
  );
}

// Подвал-море: волна заходит под последнюю карточку, ниже — бот и девиз.
function SeaFooter({ onBot }: { onBot: () => void }) {
  const handle = CLIENT_BOT_URL.replace("https://t.me/", "@");
  return (
    <footer className="relative -mt-14">
      <svg
        viewBox="0 0 400 60"
        preserveAspectRatio="none"
        aria-hidden
        className="block h-14 w-full"
      >
        <path
          d="M0 34 C 60 14 110 46 170 30 S 290 10 340 26 S 390 36 400 30 V60 H0Z"
          fill="#3fa9c0"
          opacity="0.45"
        />
        <path
          d="M0 44 C 70 26 120 56 190 40 S 300 24 350 38 S 395 46 400 42 V60 H0Z"
          fill="#0f7f97"
        />
      </svg>
      <div className="relative overflow-hidden bg-gradient-to-b from-[#0f7f97] via-[#0a5c73] to-[#063a4d] px-4 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-5 text-center">
        {/* Блики на воде — пара размытых точек, без картинки. */}
        <span className="absolute left-[12%] top-6 h-2 w-2 rounded-full bg-white/50 blur-[1px]" />
        <span className="absolute right-[18%] top-10 h-3 w-3 rounded-full bg-white/40 blur-[2px]" />
        <span className="absolute right-[8%] bottom-8 h-4 w-4 rounded-full bg-white/30 blur-[3px]" />
        <button
          type="button"
          onClick={onBot}
          className="relative inline-flex items-center gap-2 text-lg font-semibold text-white"
        >
          <TelegramIcon className="h-6 w-6" />
          {handle}
        </button>
        <div className="mx-auto mt-2 h-px w-14 bg-white/40" />
        <p className="mt-3 text-[11px] font-semibold tracking-[0.35em] text-white/70">
          ВОДА · ЛЮДИ · СВОБОДА
        </p>
      </div>
    </footer>
  );
}

// ── иконки ───────────────────────────────────────────────────────────────────
// Свои SVG: библиотеки иконок в проекте нет, а ради шести штук её не тащим.
// Цвет берут из currentColor — его задаёт кружок пункта меню.

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" {...stroke} />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" {...stroke} />
      <circle cx="15.5" cy="15" r="1.8" className="fill-accent" />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden>
      <rect x="5" y="4.5" width="14" height="16.5" rx="2.5" {...stroke} />
      <path d="M9 4.5V3.5h6v1M9 4.5h6v2H9zM8.5 11h7M8.5 14.5h7M8.5 18h4" {...stroke} />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden>
      <circle cx="12" cy="12" r="8.5" {...stroke} strokeWidth={2} />
      <path d="M12 7.5V12l3 2" {...stroke} strokeWidth={2} />
    </svg>
  );
}

function GiftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden>
      <rect x="4" y="11" width="16" height="10" rx="1.5" fill="#ff7a1a" />
      <rect x="3" y="7.5" width="18" height="4.5" rx="1.2" fill="#e8402a" />
      <rect x="10.8" y="7.5" width="2.4" height="13.5" fill="#ffd166" />
      <path
        d="M12 7.5C10.5 4.5 7 4 7 6s3 1.5 5 1.5zM12 7.5c1.5-3 5-3.5 5-1.5s-3 1.5-5 1.5z"
        fill="none"
        stroke="#e8402a"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WaveIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden>
      <path
        d="M3 19c2.5 0 3-1.5 5-1.5s2.5 1.5 5 1.5 3-1.5 5-1.5 2 1.5 3 1.5v2H3z"
        fill="#0e8a9e"
      />
      <path
        d="M4 17.5C4 10 9 5 15 5c2.8 0 5 1.6 5 4 0 1.9-1.4 3.2-3.2 3.2-1.5 0-2.4-1-2.4-2.1 0-.9.7-1.6 1.6-1.6"
        fill="none"
        stroke="#1d6fd6"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <path d="M4 17.5C5.5 13 8.5 10.5 12 10" fill="none" stroke="#1d6fd6" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden>
      <path
        d="M12 4c4.7 0 8.5 3.1 8.5 7s-3.8 7-8.5 7c-1 0-2-.1-2.9-.4L5 20l1-3.6C4.5 15 3.5 13.1 3.5 11 3.5 7.1 7.3 4 12 4z"
        {...stroke}
      />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M9 5l7 7-7 7" {...stroke} strokeWidth={2.4} />
    </svg>
  );
}

function ExternalIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M14 4h6v6M20 4l-9 9M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" {...stroke} strokeWidth={2.1} />
    </svg>
  );
}

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        d="M21.5 4.2 2.9 11.4c-1 .4-1 1.6 0 1.9l4.6 1.5 1.8 5.5c.3.8 1.3 1 1.9.4l2.6-2.5 4.8 3.5c.8.6 1.9.1 2.1-.9l3-14.6c.2-1.2-1-2.1-2.2-1.6zM9.6 14.4l8.6-7.6-10.7 6.6"
        fill="currentColor"
      />
    </svg>
  );
}

// Волна-узор в углу карточки клиента, как гравировка на воде.
function WaveDecor({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 300 110" className={className} aria-hidden>
      {[0, 14, 28, 42].map((dy) => (
        <path
          key={dy}
          d={`M0 ${70 + dy} C 60 ${30 + dy} 120 ${100 + dy} 190 ${55 + dy} S 280 ${20 + dy} 300 ${30 + dy}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
        />
      ))}
    </svg>
  );
}
