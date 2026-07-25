import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { loadAllClients } from "@/lib/clients";
import { addMemberAction, createInviteAction } from "../actions";
import { CopyLink } from "../CopyLink";

export const metadata: Metadata = { title: "Админка · Члены клуба" };

// Члены клуба: кто в клубе, у кого есть аккаунт (кабинет), кому отправить
// инвайт-ссылку. Членство обычно создаёт продажа абонемента; здесь его можно
// выдать и вручную. Инвайт живёт 7 дней и одноразовый.

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

function fmtDay(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(iso));
}

function MemberCard({
  m,
  activeSub,
  invitePath,
  inviteExpires,
}: {
  m: MemberRow;
  activeSub: boolean;
  invitePath: string | null;
  inviteExpires: string | null;
}) {
  const name = m.client?.name ?? "клиент";
  return (
    <details className="group rounded-2xl border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-2 p-4 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">⭐ {name}</p>
          <p className="truncate text-xs text-muted">
            {[m.client?.phone, `в клубе с ${fmtDay(m.since)}`]
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
            Уровень: {LEVEL_LABEL[m.level] ?? m.level} · в клубе с {fmtDay(m.since)}
          </p>
        </div>

        {/* Кабинет: аккаунт есть / ссылка ждёт отправки / ссылки ещё нет. */}
        {m.user_id ? (
          <p className="text-sm text-muted">
            Кабинет подключён — член клуба входит по телефону или email.
          </p>
        ) : invitePath ? (
          <div className="space-y-1.5">
            <CopyLink path={invitePath} />
            <p className="text-xs text-muted">
              Отправьте ссылку в мессенджер. Действует до {fmtDay(inviteExpires)},
              одноразовая.
            </p>
          </div>
        ) : (
          <form action={createInviteAction}>
            <input type="hidden" name="clientId" value={m.client_id} />
            <button
              type="submit"
              className="rounded-full border border-line px-4 py-2 text-xs font-semibold text-muted transition-colors hover:border-primary hover:text-primary"
            >
              Создать инвайт-ссылку
            </button>
          </form>
        )}
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

  const [subsRes, invitesRes, clientsRes] = await Promise.all([
    clientIds.length
      ? supabase
          .from("subscriptions")
          .select("client_id")
          .eq("status", "active")
          .in("client_id", clientIds)
      : Promise.resolve({ data: [] }),
    clientIds.length
      ? supabase
          .from("invite_tokens")
          .select("client_id, token, expires_at")
          .is("used_at", null)
          .gt("expires_at", new Date().toISOString())
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
  const inviteByClient = new Map(
    (invitesRes.data ?? []).map((t) => [
      t.client_id as string,
      { token: t.token as string, expires: t.expires_at as string },
    ]),
  );
  const memberClientIds = new Set(clientIds);
  // Сортируем по имени здесь: загрузчик страниц идёт по id (стабильный порядок
  // для range), а человеку список нужен по алфавиту.
  const candidates = clientsRes.rows
    .filter((c) => !memberClientIds.has(c.id))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));

  return (
    <div>
      <h1 className="text-2xl font-bold">Члены клуба</h1>
      <p className="mt-1 text-sm text-muted">
        Членство появляется с первым абонементом. Инвайт-ссылка открывает
        клиенту личный кабинет.
      </p>

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
        <p className="mt-2 text-sm text-muted">Пока никого — членство появится с первой продажей абонемента.</p>
      )}
      <div className="mt-3 space-y-3">
        {members.map((m) => {
          const invite = inviteByClient.get(m.client_id);
          return (
            <MemberCard
              key={m.id}
              m={m}
              activeSub={activeSubClients.has(m.client_id)}
              invitePath={invite ? `/invite/${invite.token}` : null}
              inviteExpires={invite?.expires ?? null}
            />
          );
        })}
      </div>
    </div>
  );
}
