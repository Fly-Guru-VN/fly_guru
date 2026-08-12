import type { Metadata } from "next";
import { MyExpensesScreen } from "@/components/cabinet/MyExpensesScreen";

export const metadata: Metadata = { title: "СММ · Расходы" };

export default function SmmExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  return <MyExpensesScreen searchParams={searchParams} base="/smm" />;
}
