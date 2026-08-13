import { NextRequest, NextResponse } from "next/server";
import { getAppUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { vnMonth, vnPeriod, vnShiftDays, vnWeekOf } from "@/lib/dates";
import { getMonthlyPayroll } from "@/lib/payroll";
import { buildXlsx, xlsxHeaders } from "@/lib/xlsx";

// Выгрузка расчёта выплат: /api/admin/payroll?from=YYYY-MM-DD&to=YYYY-MM-DD
// (старое ?m=YYYY-MM тоже понимаем — месяц целиком). Данные — та же функция,
// что у страницы /admin/payroll, файл не может разойтись с экраном.
// /api не проходит через middleware (см. matcher), поэтому роль проверяем сами.

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

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

  const p = request.nextUrl.searchParams;
  const from = p.get("from") ?? "";
  const to = p.get("to") ?? "";
  const m = p.get("m") ?? "";
  const week = vnWeekOf(); // как на странице: без параметров — текущая неделя
  const legacy = /^\d{4}-\d{2}$/.test(m) ? vnMonth(m) : null;

  const custom = DAY_RE.test(from) && DAY_RE.test(to) && from <= to;
  const fromDay = custom ? from : (legacy?.fromDay ?? week.fromDay);
  const lastDay = custom
    ? to
    : legacy
      ? vnShiftDays(legacy.toDay, -1)
      : week.lastDay;

  const supabase = await createClient();
  const payroll = await getMonthlyPayroll(supabase, vnPeriod(fromDay, lastDay));

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
      "Выплачено, VND",
      "Выплачено за период",
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
      // Выплаты, задевающие период: их может быть несколько (например,
      // недельные внутри выбранного месяца) — складываем и перечисляем даты,
      // чтобы в файле было видно, за что именно платили.
      i.payouts.reduce((sum, p) => sum + p.amount, 0) || "",
      i.payouts.map((p) => `${p.from}…${p.to}`).join(", "),
    ]);
  }
  // СММщик: фикс за полные недели периода. Сколько их было — пишем прямо в
  // тип строки, отдельной колонки под это заводить не стали (у инструкторов
  // такого поля нет, а шапка файла и так широкая). Его 1% в этой строке не
  // участвует — он ниже, в строках CRM.
  for (const s of payroll.smm) {
    rows.push([
      `СММ · ${s.weeks} нед`,
      s.name,
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
      s.fixed,
      s.payouts.reduce((sum, p) => sum + p.amount, 0) || "",
      s.payouts.map((p) => `${p.from}…${p.to}`).join(", "),
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
      "",
      "",
    ]);
  }
  // Доля за CRM (Дэвид + Ромчик) — такая же строка выплаты, как инструктор или
  // агент: файл должен совпадать с экраном, включая «Итого». Считается за
  // календарный месяц целиком, поэтому в тип пишем, за какой именно: в
  // недельной выгрузке эта сумма в «Итого» не входит (см. lib/payroll).
  for (const name of payroll.crm.partners) {
    rows.push([
      `CRM · ${payroll.crmMonthLabel}${payroll.crmInTotal ? "" : " (не входит в итог)"}`,
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
      "",
      "",
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
    payroll.paidOutTotal,
    "",
  ]);

  // В имени файла — обе границы периода: недельных выгрузок в папке будет
  // четыре в месяц, и «payroll-2026-08» их уже не различает.
  const name = `flyguru-payroll-${fromDay}_${lastDay}`;

  // Книга Excel — основной формат: русский Excel не считает точку с запятой
  // разделителем, и CSV открывается одной склеенной колонкой (см. lib/xlsx).
  if (p.get("format") === "xlsx") {
    return new NextResponse(new Uint8Array(buildXlsx("Расчёт выплат", rows, { totalRow: true })), {
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
