import { NextRequest, NextResponse } from "next/server";
import { getAppUser, isOffice } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { vnMonthToDate, vnPeriod } from "@/lib/dates";
import {
  channelKey,
  filterVisits,
  loadVisits,
  paymentKey,
  serviceLabel,
  sortVisits,
} from "@/lib/visits";
import { buildXlsx, xlsxHeaders } from "@/lib/xlsx";

// CSV таблицы визитов со «Статистики»: /api/admin/visits?from&to&cat&inst&pay&ch&sort&dir.
// Параметры — те же, что у страницы, и считает всё та же lib/visits: файл не
// может разойтись с экраном. /api не проходит через middleware (см. matcher),
// поэтому роль проверяем сами.

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// Значение в ячейку: кавычки, если внутри разделитель/кавычки/перенос.
function cell(v: string | number): string {
  const s = String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: NextRequest) {
  // Выгрузку качают и админ, и СММщик: таблица визитов есть в обоих кабинетах,
  // а файл обязан повторять то, что человек видит на экране.
  const user = await getAppUser();
  if (!user || !isOffice(user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const p = request.nextUrl.searchParams;
  const from = p.get("from") ?? "";
  const to = p.get("to") ?? "";
  const month = vnMonthToDate();
  const custom = DAY_RE.test(from) && DAY_RE.test(to) && from <= to;
  const range = custom ? vnPeriod(from, to) : month;

  const supabase = await createClient();
  const { rows, visitsOf } = await loadVisits(supabase, range);
  const filtered = filterVisits(rows, {
    cat: p.get("cat") ?? "",
    inst: p.get("inst") ?? "",
    pay: p.get("pay") ?? "",
    ch: p.get("ch") ?? "",
  });
  const sorted = sortVisits(
    filtered,
    p.get("sort") ?? "date",
    p.get("dir") ?? "d",
    visitsOf,
  );

  const out: (string | number)[][] = [
    [
      "Дата",
      "Клиент",
      "Занятие",
      "Оплата, VND",
      "Чем оплатил",
      "Откуда",
      "Откатал",
      "Записал",
      "Списано минут",
      "Визитов всего",
    ],
  ];
  for (const r of sorted) {
    out.push([
      r.date,
      r.client?.name ?? "",
      serviceLabel(r),
      // Списание минут — это не ноль в кассе, а «денег не было»: пустая ячейка
      // честнее нуля, который в Excel сложится с настоящими чеками.
      r.amount > 0 ? r.amount : "",
      paymentKey(r) === "" ? "не указан" : paymentKey(r),
      channelKey(r),
      r.instructor?.name ?? "",
      r.creator?.name ?? "",
      r.subscription_id ? (r.minutes_used ?? 0) : "",
      visitsOf(r),
    ]);
  }
  out.push([
    "Итого",
    "",
    "",
    sorted.reduce((s, r) => s + r.amount, 0),
    "",
    "",
    "",
    "",
    "",
    "",
  ]);

  // В имени файла — последний день периода включительно (range.toDay — граница
  // «строго меньше», то есть уже следующий день).
  const name = `flyguru-visits-${range.fromDay}_${custom ? to : month.lastDay}`;

  // Книга Excel: у David русская Windows, и точку с запятой его Excel за
  // разделитель не считает — весь CSV падал в первый столбец. В .xlsx колонки
  // разложены сразу, суммы приходят числами, а над шапкой стоит фильтр.
  if (p.get("format") === "xlsx") {
    return new NextResponse(new Uint8Array(buildXlsx("Визиты", out, { totalRow: true })), {
      headers: xlsxHeaders(`${name}.xlsx`),
    });
  }

  // BOM — чтобы кириллица не превратилась в кракозябры, если файл всё-таки
  // откроют как текст.
  const csv = "\uFEFF" + out.map((r) => r.map(cell).join(";")).join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}.csv"`,
    },
  });
}
