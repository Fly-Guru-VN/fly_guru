import { Link } from "@/i18n/navigation";

// Экран результата после действия в кабинете. Показывает, что именно сделали,
// и возвращает на чистую форму одной кнопкой («Записать следующего»).

function vnd(n: number): string {
  return `${n.toLocaleString("ru-RU")} ₫`;
}

export default async function DonePage({
  searchParams,
}: {
  searchParams: Promise<{
    type?: string;
    name?: string;
    amount?: string;
    service?: string;
    discount?: string;
    paid?: string;
    minutes?: string;
    left?: string;
    existing?: string;
    date?: string;
    claim?: string;
  }>;
}) {
  const p = await searchParams;
  const amount = Number(p.amount ?? 0);
  // Дата приходит, только если записали НЕ сегодняшним числом (пачка №10, п.2).
  const otherDay = p.date ? p.date.split("-").reverse().join(".") : null;

  let title = "Готово!";
  let details: string[] = [];
  let nextHref = "/instructor/record";
  let nextLabel = "Записать следующего";

  if (p.type === "session") {
    title = "Клиент записан";
    details = [
      `${p.name ?? "Клиент"} — ${p.service ?? "услуга"}`,
      `Чек: ${vnd(amount)}${
        Number(p.discount ?? 0) > 0
          ? ` (скидка ${vnd(Number(p.discount))} по агентской ссылке)`
          : ""
      }`,
      otherDay ? `Дата занятия: ${otherDay} (не сегодня)` : "Сессия записана на вас.",
    ];
  } else if (p.type === "subscription") {
    title = "Абонемент продан";
    details = [
      `${p.name ?? "Клиент"} — абонемент 300 минут`,
      p.paid
        ? "Оплата получена — 15% пойдут в общий котёл инструкторов."
        : p.claim
          ? // Минуты списывать можно сразу — это главное, что инструктору
            // нужно знать здесь и сейчас (пачка №10, п.5).
            "Оплата не отмечена: админ проверит и подтвердит. Минуты списывать можно уже сейчас."
          : "Оплата не отмечена — админ отметит позже, тогда 15% пойдут в общий котёл.",
    ];
    nextHref = "/instructor/subscription";
    nextLabel = "Продать ещё";
  } else if (p.type === "writeoff") {
    title = "Минуты списаны";
    details = [
      `${p.name ?? "Клиент"}: −${p.minutes ?? "?"} мин`,
      `Остаток: ${p.left ?? "?"} мин`,
    ];
    nextHref = "/instructor/writeoff";
    nextLabel = "Списать ещё";
  }

  return (
    <div className="pt-8 text-center">
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-3xl">
        ✅
      </div>
      <h1 className="text-2xl font-bold">{title}</h1>
      <div className="mt-3 space-y-1 text-muted">
        {details.map((d) => (
          <p key={d}>{d}</p>
        ))}
      </div>
      {p.existing ? (
        <p className="mx-auto mt-4 max-w-sm rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-ink">
          Этот телефон уже есть в базе — записано на существующего клиента{" "}
          <b>«{p.existing}»</b>, новая карточка не создавалась. Если это другой
          человек, укажите его настоящий номер.
        </p>
      ) : null}
      <div className="mt-8 flex flex-col gap-3">
        <Link
          href={nextHref}
          className="inline-flex w-full items-center justify-center rounded-full bg-accent px-7 py-4 text-base font-semibold text-white transition-colors hover:bg-accent-strong"
        >
          {nextLabel}
        </Link>
        <Link
          href="/instructor"
          className="inline-flex w-full items-center justify-center rounded-full border border-line px-7 py-4 text-base font-semibold text-muted transition-colors hover:border-primary hover:text-primary"
        >
          К заявкам
        </Link>
      </div>
    </div>
  );
}
