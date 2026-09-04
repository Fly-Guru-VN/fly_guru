import { redirect } from "next/navigation";

// Заход в кабинет инструктора открывает вкладку записей (разделы — в боковом
// меню). Обычно это делает proxy.ts мгновенным редиректом; здесь фолбэк на
// случай, если страница всё же отрендерится.
export default function InstructorHomePage() {
  redirect("/instructor/bookings");
}
