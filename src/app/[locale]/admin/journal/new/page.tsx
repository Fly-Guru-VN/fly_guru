import type { Metadata } from "next";
import { JournalNewScreen } from "../JournalScreens";

export const metadata: Metadata = { title: "Админка · Новый материал" };

export default function AdminJournalNewPage() {
  return <JournalNewScreen base="/admin" />;
}
