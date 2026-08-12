import type { Metadata } from "next";
import { SubscriptionsScreen } from "@/app/[locale]/admin/subscriptions/SubscriptionsScreen";

export const metadata: Metadata = { title: "СММ · Абонементы" };

export default function SmmSubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; booking?: string }>;
}) {
  return <SubscriptionsScreen searchParams={searchParams} base="/smm" />;
}
