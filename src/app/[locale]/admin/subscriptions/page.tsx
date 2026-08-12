import type { Metadata } from "next";
import { SubscriptionsScreen } from "./SubscriptionsScreen";

export const metadata: Metadata = { title: "Админка · Абонементы" };

export default function AdminSubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; booking?: string }>;
}) {
  return <SubscriptionsScreen searchParams={searchParams} base="/admin" />;
}
