import { redirect } from "next/navigation";

// Агентов больше нет (решение начальника, 09.10.2026): вкладку заменили
// «Рефералы». Экран AgentsScreen оставлен в коде — «пока что не нужен»; старые
// закладки ведут на новую вкладку.
export default function AdminAgentsPage() {
  redirect("/admin/referrals");
}
