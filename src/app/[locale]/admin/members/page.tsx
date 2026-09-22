import type { Metadata } from "next";
import { momentDay } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { loadAllClients } from "@/lib/clients";
import { addMemberAction } from "../actions";
import { PageHeader } from "@/components/cabinet/PageHeader";
import { PageNote } from "@/components/cabinet/PageNote";

export const metadata: Metadata = { title: "Админка · Члены клуба" };

// Члены клуба: кто в клубе и с какого дня. Членство заводит само списание
// последней минуты абонемента (0061, решение от 22.09.2026: в клуб принимает
// ОТКАТАННЫЙ абонемент) — форма ниже нужна только для исключений.
//
// Инвайт-ссылки на этой вкладке больше нет: кабинет клиента живёт в Telegram
// и опознаёт человека по привязанному номеру, отдельный пароль ему не нужен.

interface MemberRow {
  id: string;
  client_id: string;
  level: string;
  since: string;
  user_id: string | null;
  client: { name: string; phone: string | null } | null;
}

const LEVEL_LABEL: Record<string, string> = {
  member: "Member",
  rider: "Rider",
  legend: "Legend",
};

function MemberCard({ m, activeSub }: { m: MemberRow; activeSub: boolean }) {
  const name = m.client?.name ?? "клиент";
  return (
    <details className="group rounded-2xl border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-2 p-4 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">⭐ {name}</p>
          <p className="truncate text-xs text-muted">
            {[m.client?.phone, `в клубе с ${momentDay(m.since)}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {activeSub && (
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
            Абонемент
          </span>
        )}
        {m.user_id && (
          <span className="rounded-full bg-line/60 px-2.5 py-1 text-[11px] font-semibold text-muted">
            Аккаунт ✓
          </span>
        )}
        <span className="text-muted transition-transform group-open:rotate-180">▾</span>
      </summary>

      <div className="space-y-3 border-t border-line/70 p-4 pt-3">
        <div className="space-y-0.5 text-sm text-muted">
          {m.client?.phone && (
            <p>
              <a href={`tel:${m.client.phone}`} className="text-primary underline">
                {m.client.phone}
              </a>
            </p>
          )}
          <p>
            Уровень: {LEVEL_LABEL[m.level] ?? m.level} · в клубе с {momentDay(m.since)}
          </p>
        </div>

        {/* Кабинет клиента открывается из Telegram-бота по номеру телефона —
            ни ссылки, ни пароля выдавать не нужно. Старый парольный аккаунт
            (user_id) остался у тех, кому его успели завести до 09.09.2026. */}
        <p className="text-sm text-muted">
          {m.client?.phone
            ? "Кабинет открывается в Telegram-боте: клиент делится номером, и мы узнаём его по этому телефону."
            : "В карточке нет телефона — по нему клиента узнаёт Telegram-бот. Без номера кабинет не откроется."}
        </p>
      </div>
    </details>
  );
}

export default async function AdminMembersPage() {
  const supabase = await createClient();

  const { data: membersData } = await supabase
    .from("memberships")
    .select("id, client_id, level, since, user_id, client:clients!client_id(name, phone)")
    .order("since", { ascending: false });
  const members = (membersData ?? []) as unknown as MemberRow[];
  const clientIds = members.map((m) => m.client_id);

  const [subsRes, clientsRes] = await Promise.all([
    clientIds.length
      ? supabase
          .from("subscriptions")
          .select("client_id")
          .eq("status", "active")
          .in("client_id", clientIds)
      : Promise.resolve({ data: [] }),
    // Кандидаты для ручной выдачи членства: клиенты, которых в клубе ещё нет.
    // Полный список клиентов постранично (lib/clients): .limit(1000) молча
    // обрезал бы выпадающий список — клиента просто не было бы в выборе.
    loadAllClients<{ id: string; name: string; phone: string | null }>(
      supabase,
      "id, name, phone",
    ),
  ]);

  const activeSubClients = new Set(
    (subsRes.data ?? []).map((s) => s.client_id as string),
  );
  const memberClientIds = new Set(clientIds);
  // Сортируем по имени здесь: загрузчик страниц идёт по id (стабильный порядок
  // для range), а человеку список нужен по алфавиту.
  const candidates = clientsRes.rows
    .filter((c) => !memberClientIds.has(c.id))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));

  return (
    <div>
      <PageHeader
        title="Члены клуба"
        hint="Клиенты с абонементом и доступом в кабинет"
      />
      <PageNote>Членство появляется само, когда клиент откатает абонемент до нуля. Вручную — только исключения.</PageNote>

      <section className="mt-4 rounded-2xl border border-line bg-surface p-4">
        <h2 className="mb-3 font-bold">Принять в клуб вручную</h2>
        <form action={addMemberAction} className="flex gap-2">
          <select
            name="clientId"
            required
            className="w-full min-w-0 rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="">— выберите клиента —</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.phone ? ` · ${c.phone}` : ""}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="shrink-0 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-strong"
          >
            Принять
          </button>
        </form>
      </section>

      <p className="mt-4 text-sm text-muted">В клубе: {members.length}</p>

      {members.length === 0 && (
        <p className="mt-2 text-sm text-muted">Пока никого — членство появится, когда клиент откатает первый абонемент.</p>
      )}
      <div className="mt-3 space-y-3">
        {members.map((m) => (
          <MemberCard key={m.id} m={m} activeSub={activeSubClients.has(m.client_id)} />
        ))}
      </div>
    </div>
  );
}
