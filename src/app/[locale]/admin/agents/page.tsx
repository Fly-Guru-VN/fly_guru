import type { Metadata } from "next";
import { AgentsScreen } from "./AgentsScreen";

export const metadata: Metadata = { title: "Админка · Агенты" };

export default function AdminAgentsPage() {
  return <AgentsScreen />;
}
