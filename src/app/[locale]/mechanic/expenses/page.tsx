import type { Metadata } from "next";
import { MyExpensesScreen } from "@/components/cabinet/MyExpensesScreen";

export const metadata: Metadata = { title: "Механик · Расходы" };

export default function MechanicExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  return <MyExpensesScreen searchParams={searchParams} base="/mechanic" />;
}
