import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { vnd } from "@/lib/stats";
import { CATEGORY_LABELS, type ServiceCategory } from "@/content/services";
import { toggleServiceActiveAction, updateServiceAction } from "../actions";
import { SaveForm } from "../SaveForm";
import { ServiceCreateForm } from "./ServiceCreateForm";
import { PageHeader } from "@/components/cabinet/PageHeader";
import { PageNote } from "@/components/cabinet/PageNote";

export const metadata: Metadata = { title: "Админка · Услуги" };

// Справочник услуг: из него грузятся формы записи на сайте, запись клиента
// у инструктора и создание сессий в админке. Удаления нет (на услуги
// ссылается история заявок и сессий) — только выключение.

interface ServiceRow {
  id: string;
  name: string;
  duration_min: number | null;
  price: number | null;
  category: ServiceCategory;
  active: boolean;
}

const inputClass =
  "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary";

function ServiceCard({ s }: { s: ServiceRow }) {
  return (
    <details
      className={`group rounded-2xl border border-line bg-surface ${s.active ? "" : "opacity-60"}`}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 p-4 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{s.name}</p>
          <p className="text-xs text-muted">
            {s.duration_min != null ? `${s.duration_min} мин · ` : ""}
            {s.price != null ? vnd(s.price) : "цена по запросу"}
          </p>
        </div>
        {!s.active && (
          <span className="rounded-full bg-line/60 px-2.5 py-1 text-[11px] font-semibold text-muted">
            Выключена
          </span>
        )}
        <span className="text-muted transition-transform group-open:rotate-180">▾</span>
      </summary>

      <div className="space-y-3 border-t border-line/70 p-4 pt-3">
        <SaveForm action={updateServiceAction} className="space-y-2">
          <input type="hidden" name="id" value={s.id} />
          <label className="block text-xs text-muted">
            Название
            <input
              type="text"
              name="name"
              required
              defaultValue={s.name}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-muted">
              Цена, ₫
              <input
                type="text"
                name="price"
                inputMode="numeric"
                defaultValue={s.price ?? ""}
                placeholder="пусто = по запросу"
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="text-xs text-muted">
              Длительность, мин
              <input
                type="number"
                name="duration"
                min={1}
                defaultValue={s.duration_min ?? ""}
                placeholder="—"
                className={`mt-1 ${inputClass}`}
              />
            </label>
          </div>
          <button
            type="submit"
            className="rounded-full bg-primary px-5 py-2 text-xs font-semibold text-white transition-colors hover:opacity-90"
          >
            Сохранить
          </button>
        </SaveForm>

        <form action={toggleServiceActiveAction}>
          <input type="hidden" name="id" value={s.id} />
          <input type="hidden" name="active" value={s.active ? "1" : "0"} />
          <button
            type="submit"
            className="rounded-full border border-line px-4 py-2 text-xs font-semibold text-muted transition-colors hover:border-primary hover:text-primary"
          >
            {s.active ? "Выключить" : "Включить обратно"}
          </button>
        </form>
      </div>
    </details>
  );
}

export default async function AdminServicesPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("services")
    .select("id, name, duration_min, price, category, active")
    .order("name");
  const services = (data ?? []) as ServiceRow[];

  // Группировка по категориям в порядке справочника; внутри категории
  // активные сверху (сортировка по имени уже пришла из запроса).
  const categories = Object.keys(CATEGORY_LABELS) as ServiceCategory[];
  const byCategory = new Map<ServiceCategory, ServiceRow[]>();
  for (const cat of categories) {
    const rows = services
      .filter((s) => s.category === cat)
      .sort((a, b) => Number(b.active) - Number(a.active));
    if (rows.length > 0) byCategory.set(cat, rows);
  }

  return (
    <div>
      <PageHeader
        title="Услуги"
        hint="Справочник услуг и цен"
      />
      <PageNote>Отсюда услуги попадают в формы записи, сессии и статистику. Выключенная услуга исчезает из форм, но история занятий по ней остаётся.</PageNote>

      {/* Цены сайта берутся отсюда (связь по services.code, миграция 0010). */}
      <p className="mt-3 rounded-xl border border-accent/40 bg-accent/5 p-3 text-xs text-muted">
        Цены и длительность на страницах сайта (обучение, тандем, прайс, клуб)
        подтягиваются из этого справочника — поменяли здесь, обновилось и там.
        Названия и описания на сайте остаются текстом в коде.
      </p>

      <section className="mt-4 rounded-2xl border border-line bg-surface p-4">
        <h2 className="mb-3 font-bold">Новая услуга</h2>
        <ServiceCreateForm />
      </section>

      {services.length === 0 && (
        <p className="mt-4 text-sm text-muted">Услуг пока нет.</p>
      )}
      {[...byCategory.entries()].map(([cat, rows]) => (
        <section key={cat} className="mt-5">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">
            {CATEGORY_LABELS[cat]}
          </h2>
          <div className="space-y-3">
            {rows.map((s) => (
              <ServiceCard key={s.id} s={s} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
