import type { Metadata } from "next";
import { SourcesScreen } from "./SourcesScreen";

export const metadata: Metadata = { title: "Админка · Источники" };

export default function AdminSourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  return <SourcesScreen searchParams={searchParams} base="/admin" />;
}
