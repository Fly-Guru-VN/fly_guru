import type { Metadata } from "next";
import { ReferralsScreen } from "@/app/[locale]/admin/referrals/ReferralsScreen";

export const metadata: Metadata = { title: "СММ · Рефералы" };

// Тот же экран, что у админа, в полном составе (решение David от 09.10.2026).
export default function SmmReferralsPage() {
  return <ReferralsScreen />;
}
