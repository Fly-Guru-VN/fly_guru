import { NextRequest, NextResponse } from "next/server";
import { getAppUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { vnCurrentMonth, vnMonth } from "@/lib/dates";
import { getMonthlyPayroll } from "@/lib/payroll";

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
      a.confirmedCount,
      a.total,
    ]);
  }
  // Доля за CRM (Дэвид + Ромчик) — такая же строка выплаты, как инструктор или
  // агент: файл должен совпадать с экраном, включая «Итого».
  for (const name of payroll.crm.partners) {
    rows.push(["CRM", name, "", "", "", "", "", "", "", "", "", payroll.crm.each]);
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
    payroll.grandTotal,
  ]);

  // BOM + точка с запятой — так файл сразу открывается русским Excel.
  const csv = "\uFEFF" + rows.map((r) => r.map(cell).join(";")).join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="flyguru-payroll-${ym}.csv"`,
    },
  });
}
