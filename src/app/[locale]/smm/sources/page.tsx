import type { Metadata } from "next";
import { SourcesScreen } from "@/app/[locale]/admin/sources/SourcesScreen";

export const metadata: Metadata = { title: "СММ · Источники" };

export default function SmmSourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  return <SourcesScreen searchParams={searchParams} base="/smm" />;
}
