import { NextRequest, NextResponse } from "next/server";
import { getActiveAppUser, isOffice } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { vnDay, vnToday } from "@/lib/dates";
import { loadClientList, selectIn, SOURCE_LABEL } from "@/lib/clientList";
import { buildXlsx, xlsxHeaders } from "@/lib/xlsx";

// Excel со списком клиентов: /api/admin/clients?q&sort. Поиск и сортировка —
// те же, что на экране «Клиенты» (общий lib/clientList), но в файл идут ВСЕ
// найденные, а не только показанная порция. /api не проходит через proxy.ts
// (см. matcher), поэтому роль проверяем сами.

export async function GET(request: NextRequest) {
  // Качают админ, dev и СММщик — экран «Клиенты» есть у всех троих (решение
  // David от 09.10.2026: СММщику тоже можно, телефоны он и так видит).
  const user = await getActiveAppUser();
  if (!user || !isOffice(user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const p = request.nextUrl.searchParams;
  const supabase = await createClient();
  const { all, sorted, visits } = await loadClientList(supabase, {
    q: p.get("q") ?? "",
    sort: p.get("sort") ?? "",
  });
  const ids = sorted.map((c) => c.id);
  const agentIds = sorted
    .filter((c) => c.referrer_type === "agent" && c.referrer_id)
    .map((c) => c.referrer_id as string);

  const [subs, members, agents] = await Promise.all([
    selectIn<{ client_id: string; status: string }>(ids, (chunk) =>
      supabase
        .from("subscriptions")
        .select("client_id, status")
        .in("client_id", chunk),
    ),
    selectIn<{ client_id: string }>(ids, (chunk) =>
      supabase.from("memberships").select("client_id").in("client_id", chunk),
    ),
    selectIn<{ id: string; ref_code: string; user: unknown }>(
      [...new Set(agentIds)],
      (chunk) =>
        supabase
          .from("agents")
          .select("id, ref_code, user:users!user_id(name)")
          .in("id", chunk),
    ),
  ]);

  const activeSub = new Set(
    subs.filter((s) => s.status === "active").map((s) => s.client_id),
  );
  const member = new Set(members.map((m) => m.client_id));
  // Пригласивший член клуба — тоже клиент, его имя уже есть в общем списке.
  const nameById = new Map(all.map((c) => [c.id, c.name]));
  const agentById = new Map(
    agents.map((a) => [
      a.id,
      `${(a.user as { name: string } | null)?.name ?? "агент"} (${a.ref_code})`,
    ]),
  );

  const out: (string | number)[][] = [
    [
      "Имя",
      "Телефон",
      "Telegram",
      "Возраст",
      "Город",
      "Источник",
      "Кто привёл",
      "Член клуба",
      "Активный абонемент",
      "Допущен к выездам",
      "Занятий",
      "Потратил, VND",
      "Последний визит",
      "В базе с",
      "Заметка",
    ],
  ];
  for (const c of sorted) {
    const v = visits(c.id);
    const referrer =
      c.referrer_type === "agent" && c.referrer_id
        ? (agentById.get(c.referrer_id) ?? "")
        : c.referrer_type === "member" && c.referrer_id
          ? (nameById.get(c.referrer_id) ?? "")
          : "";
    out.push([
      c.name,
      c.phone ?? "",
      c.telegram_username ? `@${c.telegram_username}` : "",
      c.age ?? "",
      c.city ?? "",
      SOURCE_LABEL[c.source] ?? c.source,
      referrer,
      member.has(c.id) ? "да" : "",
      activeSub.has(c.id) ? "да" : "",
      c.tour_approved ? "да" : "",
      v.sessions,
      // Пусто вместо нуля — как в выгрузке визитов: «не тратил» не число.
      v.spent > 0 ? v.spent : "",
      v.lastVisit ?? "",
      vnDay(c.created_at),
      c.internal_note ?? "",
    ]);
  }

  return new NextResponse(new Uint8Array(buildXlsx("Клиенты", out)), {
    headers: xlsxHeaders(`flyguru-clients-${vnToday()}.xlsx`),
  });
}
