import type { Metadata } from "next";
import { JournalListScreen } from "@/app/[locale]/admin/journal/JournalScreens";

export const metadata: Metadata = { title: "СММ · Журнал" };

export default function SmmJournalPage() {
  return <JournalListScreen base="/smm" />;
}
