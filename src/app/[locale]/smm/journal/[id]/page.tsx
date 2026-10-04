import type { Metadata } from "next";
import { JournalEditScreen } from "@/app/[locale]/admin/journal/JournalScreens";

export const metadata: Metadata = { title: "СММ · Журнал" };

export default async function SmmJournalEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <JournalEditScreen base="/smm" id={id} />;
}
