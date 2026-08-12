import type { Metadata } from "next";
import { RecordScreen } from "@/app/[locale]/admin/record/RecordScreen";

export const metadata: Metadata = { title: "СММ · Запись клиента" };

export default function SmmRecordPage({
  searchParams,
}: {
  searchParams: Promise<{ booking?: string }>;
}) {
  return <RecordScreen searchParams={searchParams} />;
}
