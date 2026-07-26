import {
  UPDATES,
  UPDATE_ICON,
  UPDATE_LABEL,
  UPDATE_WHERE_LABEL,
  type UpdateEntry,
} from "@/content/updates";

// Лента изменений — общая для вкладки «Обновления» в кабинете инструктора и в
// кабинете админа. Список записей у обоих одинаковый: на карточке стоит метка,
// чьего кабинета касается правка, и по ней сразу видно, читать дальше или нет.
// Прятать чужие записи не стали намеренно — админу полезно знать, что нового
// появилось у инструктора, даже если сам он этой кнопки не увидит.
//
// Тексты лежат в src/content/updates.ts и едут вместе с самой правкой:
// отдельной таблицы и формы в админке нет, лента не должна опережать функции.

const KIND_CLASS: Record<UpdateEntry["kind"], string> = {
  new: "bg-primary/10 text-primary",
  fix: "bg-emerald-500/10 text-emerald-600",
  gone: "bg-amber-500/10 text-amber-600",
};

function fmtDay(day: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${day}T00:00:00Z`));
}

export function UpdatesFeed() {
  // Свежее сверху. Внутри дня порядок оставляем как в файле — там записи
  // уже идут от главной к мелочам.
  const days = [...new Set(UPDATES.map((u) => u.date))].sort((a, b) =>
    b.localeCompare(a),
  );

  return (
    <>
      {days.map((day) => (
        <section key={day} className="mt-6">
          <h2 className="text-sm font-semibold text-muted">{fmtDay(day)}</h2>
          <div className="mt-3 space-y-3">
            {UPDATES.filter((u) => u.date === day).map((u) => (
              <article
                key={`${u.date}-${u.title}`}
                className="rounded-2xl border border-line bg-surface p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-bold ${KIND_CLASS[u.kind]}`}
                  >
                    <span aria-hidden>{UPDATE_ICON[u.kind]}</span>
                    {UPDATE_LABEL[u.kind]}
                  </span>
                  <span className="inline-flex items-center rounded-lg bg-line/60 px-2 py-0.5 text-xs font-semibold text-muted">
                    {UPDATE_WHERE_LABEL[u.where]}
                  </span>
                  <p className="font-bold">{u.title}</p>
                </div>
                <p className="mt-2 text-sm text-muted">{u.text}</p>
              </article>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
