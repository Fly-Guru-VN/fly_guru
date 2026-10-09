import type { Metadata } from "next";
import { ReferralsScreen } from "./ReferralsScreen";

export const metadata: Metadata = { title: "Админка · Рефералы" };

export default function AdminReferralsPage() {
  return <ReferralsScreen />;
}
