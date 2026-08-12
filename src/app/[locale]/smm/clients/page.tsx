import type { Metadata } from "next";
import { ClientsScreen } from "@/app/[locale]/admin/clients/ClientsScreen";

export const metadata: Metadata = { title: "СММ · Клиенты" };

export default function SmmClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string }>;
}) {
  return <ClientsScreen searchParams={searchParams} base="/smm" />;
}
