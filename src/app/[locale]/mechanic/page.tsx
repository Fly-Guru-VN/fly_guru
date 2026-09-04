import { redirect } from "next/navigation";

// Заход в кабинет механика открывает календарь (разделы — в боковом меню).
// Обычно это делает proxy.ts мгновенным редиректом; здесь фолбэк на случай,
// если страница всё же отрендерится.
export default function MechanicHomePage() {
  redirect("/mechanic/calendar");
}
