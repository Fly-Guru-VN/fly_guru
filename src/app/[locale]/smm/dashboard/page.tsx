import type { Metadata } from "next";
import {
  DashboardScreen,
  type DashboardParams,
} from "@/app/[locale]/admin/dashboard/DashboardScreen";

export const metadata: Metadata = { title: "СММ · Статистика" };

// Без блока чистой прибыли (showProfit={false}): выручка, воронка заявок,
// визиты и источники — да, зарплаты и доли — нет.
export default function SmmDashboardPage({
  searchParams,
}: {
  searchParams: Promise<DashboardParams>;
}) {
  return (
    <DashboardScreen searchParams={searchParams} base="/smm" showProfit={false} />
  );
}
