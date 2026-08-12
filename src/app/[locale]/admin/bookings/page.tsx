import type { Metadata } from "next";
import { BookingsScreen } from "./BookingsScreen";

export const metadata: Metadata = { title: "Админка · Заявки" };

export default function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  return <BookingsScreen searchParams={searchParams} base="/admin" />;
}
