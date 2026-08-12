import type { Metadata } from "next";
import { ClientsScreen } from "./ClientsScreen";

export const metadata: Metadata = { title: "Админка · Клиенты" };

export default function AdminClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string }>;
}) {
  return <ClientsScreen searchParams={searchParams} base="/admin" />;
}
