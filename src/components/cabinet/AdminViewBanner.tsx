import { Link } from "@/i18n/navigation";

// Плашка «ты админ, но смотришь чужой кабинет».
//
// Админу разрешено заходить в кабинеты инструктора и механика (посмотреть, что
// видит человек, оформить занятие за него). Но кабинет показывает ЕГО имя, его
// ЗП и кнопку «Открыть смену» — и это читается как «у аккаунта слетела роль».
// Плашка снимает вопрос и даёт дорогу обратно в админку одним нажатием.
export function AdminViewBanner({ cabinet }: { cabinet: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
      <span>
        Вы вошли как <b>админ</b> и смотрите кабинет {cabinet}.
      </span>
      <Link
        href="/admin"
        className="shrink-0 rounded-full border border-amber-500/50 px-3 py-1 text-xs font-semibold transition-colors hover:bg-amber-500/15"
      >
        Вернуться в админку
      </Link>
    </div>
  );
}
