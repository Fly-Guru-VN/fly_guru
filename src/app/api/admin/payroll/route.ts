import { NextRequest, NextResponse } from "next/server";
import { getAppUser, isAdminLike } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { vnMonth, vnPeriod, vnShiftDays, vnWeekToDate } from "@/lib/dates";
import {
  getMonthlyPayroll,
  getPayoutHistory,
  type DueRow,
} from "@/lib/payroll";
import { buildXlsx, xlsxHeaders } from "@/lib/xlsx";

// Выгрузка расчёта выплат: /api/admin/payroll?from=YYYY-MM-DD&to=YYYY-MM-DD
// (старое ?m=YYYY-MM тоже понимаем — месяц целиком). Данные — та же функция,
// что у страницы /admin/payroll, файл не может разойтись с экраном.
// /api не проходит через middleware (см. matcher), поэтому роль проверяем сами.

// Подписи ролей в файле — те же слова, что на вкладке.
const KIND: Record<DueRow["kind"], string> = {
  instructor: "инструктор",
  smm: "СММ",
  dev: "разработчик",
  mechanic: "штат",
  agent: "агент",
  crm: "справка",
};

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// Значение в ячейку: кавычки, если внутри разделитель/кавычки/перенос.
function cell(v: string | number): string {
  const s = String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: NextRequest) {
  const user = await getAppUser();
  if (!user || !isAdminLike(user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const p = request.nextUrl.searchParams;
  const from = p.get("from") ?? "";
  const to = p.get("to") ?? "";
  const m = p.get("m") ?? "";
  const week = vnWeekToDate(); // как на странице: понедельник этой недели → сегодня
  const legacy = /^\d{4}-\d{2}$/.test(m) ? vnMonth(m) : null;

  const custom = DAY_RE.test(from) && DAY_RE.test(to) && from <= to;
  const fromDay = custom ? from : (legacy?.fromDay ?? week.fromDay);
  const lastDay = custom
    ? to
    : legacy
      ? vnShiftDays(legacy.toDay, -1)
      : week.lastDay;

  const supabase = await createClient();
  const range = vnPeriod(fromDay, lastDay);
  const [payroll, history] = await Promise.all([
    getMonthlyPayroll(supabase, range),
    getPayoutHistory(supabase),
  ]);

  // Файл повторяет экран: сначала «кому сколько осталось», потом выплаты
  // выбранного периода отдельным блоком. Широкой шапки с выходами и
  // абонементами больше нет — подробности расчёта живут на самой вкладке, а в
  // файле начальник сводит деньги, а не проверяет регламент смен.
  //
  // Колонок две пары: за выбранный период (справка «сколько заработали за эти
  // дни») и с точки отсчёта (из них и получается долг). Одна пара тут не
  // годится: «осталось» считается только накопительно, см. lib/payroll.
  const epoch = payroll.epoch;
  const rows: (string | number)[][] = [
    [
      "Кто",
      "Роль",
      "Начислено за период, VND",
      "Выплачено за период, VND",
      `Начислено с ${epoch}, VND`,
      `Выплачено с ${epoch}, VND`,
      "Осталось, VND",
    ],
  ];
  for (const r of payroll.rows) {
    rows.push([
      r.name,
      KIND[r.kind],
      Math.round(r.accrued),
      Math.round(r.paid),
      Math.round(r.accruedToDate),
      Math.round(r.paidToDate),
      r.left === null ? "" : Math.round(r.left),
    ]);
  }
  rows.push([
    "Итого",
    "",
    Math.round(payroll.accruedTotal),
    Math.round(payroll.paidTotal),
    Math.round(payroll.accruedToDateTotal),
    Math.round(payroll.paidToDateTotal),
    Math.round(payroll.leftTotal),
  ]);

  // Выплаты выбранного периода — по дню выдачи, как на экране.
  const inPeriod = history.filter(
    (h) => h.paidOn >= fromDay && h.paidOn <= lastDay,
  );
  if (inPeriod.length > 0) {
    rows.push([]);
    rows.push([
      "Выплаты за период",
      "Дата",
      "Сумма, VND",
      "Комментарий",
      "",
      "",
      "",
    ]);
    for (const h of inPeriod) {
      rows.push([
        h.name,
        h.paidOn,
        Math.round(h.amount),
        h.comment ?? (h.period ? `за ${h.period.from}…${h.period.to}` : ""),
        "",
        "",
        "",
      ]);
    }
  }

  // В имени файла — обе границы периода: недельных выгрузок в папке будет
  // четыре в месяц, и «payroll-2026-08» их уже не различает.
  const name = `flyguru-payroll-${fromDay}_${lastDay}`;

  // Книга Excel — основной формат: русский Excel не считает точку с запятой
  // разделителем, и CSV открывается одной склеенной колонкой (см. lib/xlsx).
  if (p.get("format") === "xlsx") {
    return new NextResponse(new Uint8Array(buildXlsx("Выплата зарплаты", rows, { totalRow: true })), {
      headers: xlsxHeaders(`${name}.xlsx`),
    });
  }

  // BOM — чтобы кириллица не превратилась в кракозябры, если файл всё-таки
  // откроют как текст.
  const csv = "\uFEFF" + rows.map((r) => r.map(cell).join(";")).join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}.csv"`,
    },
  });
}
