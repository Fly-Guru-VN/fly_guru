import type { Metadata } from "next";
import { AgentsScreen } from "@/app/[locale]/admin/agents/AgentsScreen";

export const metadata: Metadata = { title: "СММ · Агенты" };

export default function SmmAgentsPage() {
  return <AgentsScreen />;
}
