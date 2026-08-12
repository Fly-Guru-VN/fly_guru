import type { Metadata } from "next";
import { UpdatesScreen } from "@/components/cabinet/UpdatesScreen";

export const metadata: Metadata = { title: "Админка · Обновления" };

// Сам экран — общий для кабинетов (components/cabinet/UpdatesScreen): лента
// одна на всех, и расходиться её версиям незачем.
export default function AdminUpdatesPage() {
  return <UpdatesScreen />;
}
