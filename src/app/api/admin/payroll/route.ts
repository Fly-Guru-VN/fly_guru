import { NextRequest, NextResponse } from "next/server";
import { getAppUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { vnCurrentMonth, vnMonth } from "@/lib/dates";
import { getMonthlyPayroll } from "@/lib/payroll";
import { buildXlsx, xlsxHeaders } from "@/lib/xlsx";

// CSV расчёта месяца: /api/admin/payroll?m=YYYY-MM. Данные — та же функция,
// что у страницы /admin/payroll, файл не может разойтись с экраном.
// /api не проходит через middleware (см. matcher), поэтому роль проверяем сами.

// Значение в ячейку: кавычки, если внутри разделитель/кавычки/перенос.
function cell(v: string | number): string {
  const s = String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: NextRequest) {
  const user = await getAppUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const currentYm = vnCurrentMonth().fromDay.slice(0, 7);
  const m = request.nextUrl.searchParams.get("m") ?? "";
  const ym = /^\d{4}-\d{2}$/.test(m) && m <= currentYm ? m : currentYm;

  const supabase = await createClient();
  const payroll = await getMonthlyPayroll(supabase, vnMonth(ym));

  const rows: (string | number)[][] = [
    [
      "Тип",
      "Имя",
      "Сессии, шт",
      "Выручка сессий, VND",
      "Доля 15% занятий, VND",
      "Выходы зачтены, шт",
      "Выходы не зачтены, шт",
      "Смены впереди, шт",
      "За выходы, VND",
      "Продал абонементов, шт",
      "Доля абонементов, VND",
      "Подтверждённые клиенты, шт",
      "Итого к выплате, VND",
    ],
  ];
  for (const i of payroll.instructors) {
    rows.push([
      "Инструктор",
      i.name,
      i.sessionsCount,
      i.sessionsRevenue,
      i.salaryFromSessions,
      i.shiftsCount,
      i.shiftsUnpaidCount,
      i.shiftsPlannedCount,
      i.salaryFromShifts,
      i.paidSubsCount,
      i.salaryFromSubs,
      "",
      i.total,
    ]);
  }
  for (const a of payroll.agents) {
    rows.push([
      "Агент",
      a.name,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      a.confirmedCount,
      a.total,
    ]);
  }
  // Доля за CRM (Дэвид + Ромчик) — такая же строка выплаты, как инструктор или
  // агент: файл должен совпадать с экраном, включая «Итого».
  for (const name of payroll.crm.partners) {
    rows.push([
      "CRM",
      name,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      payroll.crm.each,
    ]);
  }
  rows.push([
    "Итого",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    payroll.grandTotal,
  ]);

  // Книга Excel — основной формат: русский Excel не считает точку с запятой
  // разделителем, и CSV открывается одной склеенной колонкой (см. lib/xlsx).
  if (request.nextUrl.searchParams.get("format") === "xlsx") {
    return new NextResponse(new Uint8Array(buildXlsx("Расчёт месяца", rows, { totalRow: true })), {
      headers: xlsxHeaders(`flyguru-payroll-${ym}.xlsx`),
    });
  }

  // BOM — чтобы кириллица не превратилась в кракозябры, если файл всё-таки
  // откроют как текст.
  const csv = "\uFEFF" + rows.map((r) => r.map(cell).join(";")).join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="flyguru-payroll-${ym}.csv"`,
    },
  });
}
