import type { Metadata } from "next";
import { SessionsScreen } from "@/app/[locale]/admin/sessions/SessionsScreen";

export const metadata: Metadata = { title: "СММ · Сессии" };

export default function SmmSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  return <SessionsScreen searchParams={searchParams} />;
}
