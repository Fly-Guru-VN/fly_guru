import { redirect } from "@/i18n/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

// Личная ссылка /r/<код> (агента или инструктора).
//
// Раньше здесь был отдельный лендинг — он никуда не делся, лежит рядом в
// RefLanding.tsx и ждёт доработки. Сейчас же ссылка просто уводит гостя на
// главную: там тот же самый набор кнопок «Записаться», и человек видит обычный
// сайт целиком, а не одну страницу.
//
// Реф-код при этом НЕ теряется: он уезжает на главную в адресе (?ref=<код>),
// а там его ловит общий Attribution — кладёт в браузер на 30 дней и отмечает
// переход в статистике. Дальше всё как прежде: заявка из любой формы сайта
// уйдёт с этим кодом, а форма записи покажет агентскую скидку.
//
// Страница динамическая: код проверяется в базе при каждом заходе, поэтому
// force-static здесь НЕ ставим.

// Живой ли код: активный агент или инструктор с личным кодом. Проверяем до
// редиректа, чтобы мусорный код (опечатка, ссылка удалённого агента) не осел
// в браузере гостя на 30 дней и не цеплялся ко всем его заявкам.
async function refExists(code: string): Promise<boolean> {
  const supabase = createAdminClient();

  const { data: agent } = await supabase
    .from("agents")
    .select("id")
    .eq("ref_code", code)
    .eq("active", true)
    .maybeSingle();
  if (agent) return true;

  const { data: instructor } = await supabase
    .from("users")
    .select("id")
    .eq("ref_code", code)
    .eq("role", "instructor")
    .maybeSingle();
  return Boolean(instructor);
}

export default async function ReferralRedirectPage({
  params,
}: {
  params: Promise<{ locale: string; code: string }>;
}) {
  const { locale, code } = await params;

  // Код живой — уносим его с собой на главную. Нет — просто главная, без кода.
  const href = (await refExists(code))
    ? { pathname: "/", query: { ref: code } }
    : "/";

  redirect({ href, locale });
}
