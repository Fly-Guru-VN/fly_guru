import type { Metadata } from "next";
import { JournalListScreen } from "./JournalScreens";

export const metadata: Metadata = { title: "Админка · Журнал" };

export default function AdminJournalPage() {
  return <JournalListScreen base="/admin" />;
}
