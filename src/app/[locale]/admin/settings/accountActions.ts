"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveAppUser, isAdminLike, isLeftStaff, type AppRole } from "@/lib/auth";
import { EMPLOYMENT_ROLES } from "@/lib/staff";
import { isValidPhone, PHONE_ERROR, phoneDigits, phonesMatch } from "@/lib/phone";
import { generatePassword, techEmailForPhone } from "@/lib/staffAccount";

// Аккаунты сотрудников прямо из «Настроек» (09.11.2026, перед передачей
// проекта начальнику). Раньше вход заводили только скриптом из терминала.
//
// Всё пишем service_role: auth.admin есть только у него. Поэтому каждое
// действие само проверяет, что его вызвал действующий админ (getActiveAppUser,
// а не кнопка в интерфейсе), и работает только со штатом (EMPLOYMENT_ROLES):
// админа, разработчика, агента и клиента отсюда не тронуть.
//
// Пароль возвращаем в браузер ровно один раз и нигде не храним и не логируем.

export interface AccountState {
  error: string | null;
  // Заполнено, когда только что выдан пароль: показываем один раз.
  issued?: { name: string; login: string; password: string };
  done?: boolean;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

async function requireAdmin() {
  const user = await getActiveAppUser();
  if (!user || !isAdminLike(user.role)) redirect("/login?next=/admin");
  return user;
}

type Admin = ReturnType<typeof createAdminClient>;

// Логин по телефону ищется перебором users (login/actions → resolveEmailByPhone):
// два человека с одним номером = вход уедет не туда. Номер должен быть свободен.
async function phoneTakenBy(
  admin: Admin,
  phone: string,
  exceptId: string | null,
): Promise<string | null | false> {
  const { data, error } = await admin
    .from("users")
    .select("id, name, phone")
    .not("phone", "is", null);
  if (error) {
    console.error("[staff account] phone lookup:", error.message);
    return null; // null = не смогли проверить
  }
  const other = (data ?? []).find((u) => u.id !== exceptId && phonesMatch(u.phone, phone));
  return other ? other.name || "другой пользователь" : false;
}

function authErrorText(message: string): string {
  if (/already (been )?registered|already exists/i.test(message)) {
    return "Вход с этим номером уже существует. Если это старый вход уволенного, сначала удалите его.";
  }
  if (/password/i.test(message)) {
    return `Supabase не принял пароль: ${message}`;
  }
  return `Не удалось создать вход: ${message}`;
}

// Новый сотрудник: строка в users и вход одним нажатием.
export async function createStaffAction(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "") as AppRole;
  const phone = String(formData.get("phone") ?? "").trim();
  const hiredAt = String(formData.get("hiredAt") ?? "").trim();

  if (!name) return { error: "Укажите имя." };
  if (!EMPLOYMENT_ROLES.includes(role)) return { error: "Выберите должность." };
  if (!isValidPhone(phone)) return { error: PHONE_ERROR };
  if (hiredAt && !DAY_RE.test(hiredAt)) return { error: "Неверная дата первого рабочего дня." };

  const admin = createAdminClient();
  const taken = await phoneTakenBy(admin, phone, null);
  if (taken === null) return { error: "Не удалось проверить номер. Попробуйте ещё раз." };
  if (taken) return { error: `Этот номер уже записан на «${taken}».` };

  const email = techEmailForPhone(phone);
  const password = generatePassword();
  const auth = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role },
    user_metadata: { name },
  });
  if (auth.error || !auth.data.user) {
    return { error: authErrorText(auth.error?.message ?? "нет ответа") };
  }

  const { error } = await admin.from("users").insert({
    role,
    name,
    phone: phoneDigits(phone),
    email,
    auth_id: auth.data.user.id,
    hired_at: hiredAt || null,
  });
  if (error) {
    // Без строки в users вход бесполезен: роль читается из БД. Откатываем.
    console.error("[staff account] insert user:", error.message);
    await admin.auth.admin.deleteUser(auth.data.user.id);
    return { error: `Не удалось добавить сотрудника: ${error.message}` };
  }

  revalidatePath("/", "layout");
  return { error: null, issued: { name, login: phoneDigits(phone), password } };
}

// Строка сотрудника есть, входа нет: вернули в штат после «Удалить вход» или
// человек заведён давно без логина.
export async function createStaffLoginAction(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const phone = String(formData.get("phone") ?? "").trim();
  if (!id) return { error: "Нет сотрудника." };
  if (!isValidPhone(phone)) return { error: PHONE_ERROR };

  const admin = createAdminClient();
  const { data: row, error: readError } = await admin
    .from("users")
    .select("id, name, role, auth_id, left_at")
    .eq("id", id)
    .in("role", EMPLOYMENT_ROLES)
    .maybeSingle();
  if (readError || !row) return { error: "Сотрудник не найден." };
  if (row.auth_id) return { error: "У сотрудника уже есть вход." };
  // Уволенного вход всё равно не пустит (login/actions), заводить незачем.
  if (isLeftStaff(row)) return { error: "Сотрудник уволен. Сначала верните его в штат." };

  const taken = await phoneTakenBy(admin, phone, id);
  if (taken === null) return { error: "Не удалось проверить номер. Попробуйте ещё раз." };
  if (taken) return { error: `Этот номер уже записан на «${taken}».` };

  const email = techEmailForPhone(phone);
  const password = generatePassword();
  const auth = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: row.role },
    user_metadata: { name: row.name },
  });
  if (auth.error || !auth.data.user) {
    return { error: authErrorText(auth.error?.message ?? "нет ответа") };
  }

  // auth_id is null в условии: две вкладки не привяжут два входа к одному человеку.
  const { data: linked, error } = await admin
    .from("users")
    .update({ auth_id: auth.data.user.id, phone: phoneDigits(phone), email })
    .eq("id", id)
    .is("auth_id", null)
    .select("id");
  if (error || !linked?.length) {
    if (error) console.error("[staff account] link login:", error.message);
    await admin.auth.admin.deleteUser(auth.data.user.id);
    return { error: "Не удалось привязать вход. Обновите страницу и попробуйте ещё раз." };
  }

  revalidatePath("/", "layout");
  return {
    error: null,
    issued: { name: row.name, login: phoneDigits(phone), password },
  };
}

// Забыл пароль: выдаём новый. Старый перестаёт подходить сразу.
export async function resetStaffPasswordAction(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Нет сотрудника." };

  const admin = createAdminClient();
  const { data: row, error: readError } = await admin
    .from("users")
    .select("name, phone, email, auth_id")
    .eq("id", id)
    .in("role", EMPLOYMENT_ROLES)
    .maybeSingle();
  if (readError || !row) return { error: "Сотрудник не найден." };
  if (!row.auth_id) return { error: "У сотрудника нет входа. Сначала создайте его." };

  const password = generatePassword();
  const { error } = await admin.auth.admin.updateUserById(row.auth_id, { password });
  if (error) return { error: `Не удалось сменить пароль: ${error.message}` };

  return {
    error: null,
    issued: {
      name: row.name,
      login: phoneDigits(row.phone ?? "") || row.email || "",
      password,
    },
  };
}

// История, из-за которой строку сотрудника удалять нельзя. 21.08.2026 удаление
// строки в users каскадом снесло смены и отметки выплат (shifts,
// salary_payouts, sick_leaves, agents стоят on delete cascade), а у занятий
// пропал бы инструктор. Поэтому полностью удаляем только того, у кого нет
// ничего: завели по ошибке. Остальных увольняют датой.
// Связи без on delete (expenses.created_by, subscription_extensions.sold_by)
// сами не дадут удалить строку, это вторая страховка.
const HISTORY: { table: string; column: string; label: string }[] = [
  { table: "sessions", column: "instructor_id", label: "занятия" },
  { table: "shifts", column: "instructor_id", label: "смены" },
  { table: "salary_payouts", column: "instructor_id", label: "выплаты" },
  { table: "sick_leaves", column: "user_id", label: "больничные" },
  { table: "subscriptions", column: "sold_by", label: "проданные абонементы" },
  { table: "subscription_extensions", column: "sold_by", label: "продления" },
  { table: "bookings", column: "accepted_by", label: "принятые заявки" },
  { table: "expenses", column: "created_by", label: "расходы" },
  { table: "agents", column: "user_id", label: "агентская карточка" },
];

async function historyOf(admin: Admin, id: string): Promise<string[] | null> {
  const found: string[] = [];
  const results = await Promise.all(
    HISTORY.map((h) =>
      admin.from(h.table).select("*", { count: "exact", head: true }).eq(h.column, id),
    ),
  );
  for (let i = 0; i < HISTORY.length; i++) {
    const r = results[i];
    if (r.error) {
      console.error(`[staff account] history ${HISTORY[i].table}:`, r.error.message);
      return null; // не смогли проверить = не удаляем
    }
    if ((r.count ?? 0) > 0) found.push(`${HISTORY[i].label}: ${r.count}`);
  }
  return found;
}

// Удалить сотрудника полностью: только если у него нет никакой истории.
export async function deleteStaffForeverAction(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Нет сотрудника." };

  const admin = createAdminClient();
  const { data: row, error: readError } = await admin
    .from("users")
    .select("id, name, auth_id")
    .eq("id", id)
    .in("role", EMPLOYMENT_ROLES)
    .maybeSingle();
  if (readError || !row) return { error: "Сотрудник не найден." };

  const history = await historyOf(admin, id);
  if (history === null) return { error: "Не удалось проверить историю. Ничего не удалено." };
  if (history.length > 0) {
    return {
      error: `Удалить нельзя: у ${row.name} уже есть ${history.join(", ")}. Такого сотрудника увольняют датой, тогда история остаётся.`,
    };
  }

  const { error } = await admin.from("users").delete().eq("id", id).in("role", EMPLOYMENT_ROLES);
  if (error) return { error: `Не удалось удалить: ${error.message}. Ничего не удалено.` };

  // Строки больше нет, вход без неё не пустит (роль читается из БД), но и
  // висеть ему незачем. 404 = уже удалён руками.
  if (row.auth_id) {
    const del = await admin.auth.admin.deleteUser(row.auth_id);
    if (del.error && del.error.status !== 404) {
      console.error("[staff account] delete auth after row:", del.error.message);
    }
  }

  revalidatePath("/", "layout");
  return { error: null, done: true };
}
