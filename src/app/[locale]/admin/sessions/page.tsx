import type { Metadata } from "next";
import { SessionsScreen } from "./SessionsScreen";

export const metadata: Metadata = { title: "Админка · Сессии" };

export default function AdminSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  return <SessionsScreen searchParams={searchParams} />;
}
