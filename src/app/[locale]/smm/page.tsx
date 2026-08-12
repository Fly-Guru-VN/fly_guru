import { redirect } from "next/navigation";

// Заход в кабинет СММщика открывает заявки (разделы — в боковом меню). Обычно
// это делает middleware мгновенным редиректом; здесь фолбэк на случай, если
// страница всё же отрендерится.
export default function SmmHomePage() {
  redirect("/smm/bookings");
}
