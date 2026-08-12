import type { Metadata } from "next";
import { DashboardScreen, type DashboardParams } from "./DashboardScreen";

export const metadata: Metadata = { title: "Админка · Статистика" };

export default function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<DashboardParams>;
}) {
  return <DashboardScreen searchParams={searchParams} base="/admin" showProfit />;
}
