import type { Metadata } from "next";
import { BookingsScreen } from "@/app/[locale]/admin/bookings/BookingsScreen";

export const metadata: Metadata = { title: "СММ · Заявки" };

export default function SmmBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  return <BookingsScreen searchParams={searchParams} base="/smm" />;
}
