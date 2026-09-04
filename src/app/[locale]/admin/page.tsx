import { redirect } from "next/navigation";

// Заход в кабинет админа открывает вкладку заявок (разделы — в боковом меню).
// Обычно это делает proxy.ts мгновенным редиректом; здесь фолбэк на случай,
// если страница всё же отрендерится.
export default function AdminHomePage() {
  redirect("/admin/bookings");
}
