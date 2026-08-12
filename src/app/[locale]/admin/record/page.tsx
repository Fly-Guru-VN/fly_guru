import type { Metadata } from "next";
import { RecordScreen } from "./RecordScreen";

export const metadata: Metadata = { title: "Админка · Запись клиента" };

export default function AdminRecordPage({
  searchParams,
}: {
  searchParams: Promise<{ booking?: string }>;
}) {
  return <RecordScreen searchParams={searchParams} />;
}
