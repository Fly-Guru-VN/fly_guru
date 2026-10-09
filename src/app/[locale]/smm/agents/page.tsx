import { redirect } from "next/navigation";

// Агентов больше нет (09.10.2026) — см. admin/agents/page.tsx.
export default function SmmAgentsPage() {
  redirect("/smm/referrals");
}
