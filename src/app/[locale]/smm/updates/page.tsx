import type { Metadata } from "next";
import { UpdatesScreen } from "@/components/cabinet/UpdatesScreen";

export const metadata: Metadata = { title: "СММ · Обновления" };

export default function SmmUpdatesPage() {
  return <UpdatesScreen />;
}
