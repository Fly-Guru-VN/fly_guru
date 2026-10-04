import type { Metadata } from "next";
import { JournalEditScreen } from "../JournalScreens";

export const metadata: Metadata = { title: "Админка · Журнал" };

export default async function AdminJournalEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <JournalEditScreen base="/admin" id={id} />;
}
