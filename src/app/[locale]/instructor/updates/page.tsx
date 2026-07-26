import {
  UPDATES,
  UPDATE_ICON,
  UPDATE_LABEL,
  type UpdateEntry,
} from "@/content/updates";

// «Обновления» — лента изменений кабинета для инструктора.
//
// Зачем экран: новые функции появлялись молча (инструктор о них просто не
// знал), а убранные так же молча исчезали и выглядели поломкой. Тексты лежат
// в src/content/updates.ts и едут вместе с самой правкой — отдельной таблицы
// и формы в админке нет намеренно, лента не должна опережать функции.
//
// Прочитанность запоминает меню (Sidebar) в localStorage телефона: заглянул
// на вкладку — красная точка гаснет.

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

export default function InstructorUpdatesPage() {
  // Свежее сверху. Внутри дня порядок оставляем как в файле — там записи
  // уже идут от главной к мелочам.
  const days = [...new Set(UPDATES.map((u) => u.date))].sort((a, b) =>
    b.localeCompare(a),
  );

  return (
    <div>
      <h1 className="text-2xl font-bold">Обновления</h1>
      <p className="mt-1 text-sm text-muted">
        Что нового в кабинете, что починили и что убрали. Свежее — сверху.
      </p>

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
                  <p className="font-bold">{u.title}</p>
                </div>
                <p className="mt-2 text-sm text-muted">{u.text}</p>
              </article>
            ))}
          </div>
        </section>
      ))}

      <p className="mt-8 text-xs text-muted">
        Не хватает чего-то или непонятно, куда делась кнопка, — скажите админу,
        добавим сюда.
      </p>
    </div>
  );
}
