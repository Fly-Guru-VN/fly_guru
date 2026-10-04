import type { Metadata } from "next";
import { JournalNewScreen } from "@/app/[locale]/admin/journal/JournalScreens";

export const metadata: Metadata = { title: "СММ · Новый материал" };

export default function SmmJournalNewPage() {
  return <JournalNewScreen base="/smm" />;
}
