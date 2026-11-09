"use client";

import { useActionState, useState } from "react";
import { ConfirmSubmit } from "../ConfirmSubmit";
import { Spinner } from "@/components/Spinner";
import {
  createStaffAction,
  createStaffLoginAction,
  deleteStaffForeverAction,
  resetStaffPasswordAction,
  type AccountState,
} from "./accountActions";
import { btn, btnDanger, btnPrimary, dateInput, fieldLabel, textInput } from "./staffUi";

// Кнопки входа в кабинет и удаления сотрудника (09.11.2026). Клиентские,
// потому что после выдачи пароля его нужно показать на экране один раз.
// Пароль живёт только в памяти этой вкладки: обновили страницу — его нет,
// тогда «Выдать новый пароль».

const INITIAL: AccountState = { error: null };

function ErrorText({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="alert" className="mt-2 text-xs font-semibold text-red-700">
      {text}
    </p>
  );
}

// Карточка с логином и паролем. Показываем один раз, сразу после выдачи.
function IssuedCard({ issued }: { issued: NonNullable<AccountState["issued"]> }) {
  const [copied, setCopied] = useState(false);
  const loginUrl = `${window.location.origin}/login`;
  const text = `${issued.name}, вход в кабинет FlyGuru\n${loginUrl}\nЛогин: ${issued.login}\nПароль: ${issued.password}`;

  return (
    <div className="mt-3 rounded-xl border-2 border-emerald-400 bg-white p-3">
      <p className="text-sm font-bold text-emerald-800">Вход готов: {issued.name}</p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-slate-600">Логин</dt>
        <dd className="font-mono font-semibold text-ink">{issued.login}</dd>
        <dt className="text-slate-600">Пароль</dt>
        <dd className="font-mono text-base font-bold tracking-wider text-ink">
          {issued.password}
        </dd>
      </dl>
      <p className="mt-2 text-xs text-slate-700">
        Перешлите это сотруднику сейчас: пароль больше нигде не сохранится и
        после обновления страницы исчезнет. Забудет: «Выдать новый пароль».
      </p>
      <button
        type="button"
        className={`${btn} mt-2`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? "Скопировано ✓" : "Скопировать для отправки"}
      </button>
    </div>
  );
}

// «+ Добавить сотрудника»: строка в штате и вход одним нажатием.
export function AddStaffForm({ today }: { today: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createStaffAction, INITIAL);

  return (
    <div>
      {!open && (
        <button type="button" className={btnPrimary} onClick={() => setOpen(true)}>
          + Добавить сотрудника
        </button>
      )}

      {open && (
        <form
          action={action}
          className="rounded-xl border border-primary/40 bg-white p-4 shadow-sm"
        >
          <h3 className="font-bold text-ink">Новый сотрудник</h3>
          <p className="mt-1 text-xs text-slate-700">
            Создаётся сотрудник и сразу вход в кабинет. Логин: номер телефона,
            пароль придумает система и покажет один раз.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className={fieldLabel}>
              Имя
              <input name="name" required className={textInput} placeholder="Иван" />
            </label>
            <label className={fieldLabel}>
              Должность
              <select name="role" defaultValue="instructor" className={textInput}>
                <option value="instructor">Инструктор</option>
                <option value="smm">СММ</option>
                <option value="mechanic">Механик</option>
              </select>
            </label>
            <label className={fieldLabel}>
              Телефон (это и будет логин)
              <input
                name="phone"
                required
                inputMode="tel"
                className={textInput}
                placeholder="0901234567"
              />
            </label>
            <label className={`${fieldLabel} min-w-0`}>
              Первый рабочий день
              <input type="date" name="hiredAt" defaultValue={today} className={dateInput} />
            </label>
          </div>
          <ErrorText text={state.error} />
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="submit" className={btnPrimary} disabled={pending}>
              {pending && <Spinner />}
              {pending ? "Создаём…" : "Создать сотрудника и вход"}
            </button>
            <button type="button" className={btn} onClick={() => setOpen(false)}>
              Закрыть
            </button>
          </div>
          {state.issued && <IssuedCard issued={state.issued} />}
        </form>
      )}
    </div>
  );
}

// Есть вход: «Выдать новый пароль». Нет входа: «Создать вход» по телефону.
export function LoginControls({
  id,
  name,
  hasLogin,
  phone,
  canCreate,
}: {
  id: string;
  name: string;
  hasLogin: boolean;
  phone: string | null;
  canCreate: boolean;
}) {
  const [resetState, resetAction, resetPending] = useActionState(
    resetStaffPasswordAction,
    INITIAL,
  );
  const [createState, createAction, createPending] = useActionState(
    createStaffLoginAction,
    INITIAL,
  );

  // После «Создать вход» страница перерисуется уже с hasLogin=true, поэтому
  // выданный пароль показываем вне веток, иначе он исчезнет в тот же миг.
  const issued = resetState.issued ?? createState.issued;

  return (
    <div className="mt-2">
      {hasLogin ? (
        <form action={resetAction}>
          <input type="hidden" name="id" value={id} />
          <ConfirmSubmit
            message={`Выдать ${name} новый пароль? Старый сразу перестанет подходить.`}
            className={btn}
          >
            {resetPending && <Spinner className="h-3.5 w-3.5" />}
            Выдать новый пароль
          </ConfirmSubmit>
          <ErrorText text={resetState.error} />
        </form>
      ) : canCreate ? (
        <form action={createAction}>
          <input type="hidden" name="id" value={id} />
          <div className="flex flex-wrap items-end gap-2">
            <label className={fieldLabel}>
              Телефон для входа
              <input
                name="phone"
                required
                inputMode="tel"
                defaultValue={phone ?? ""}
                className={`${textInput} w-44`}
                placeholder="0901234567"
              />
            </label>
            <button type="submit" className={btn} disabled={createPending}>
              {createPending && <Spinner className="h-3.5 w-3.5" />}
              Создать вход
            </button>
          </div>
          <ErrorText text={createState.error} />
        </form>
      ) : null}
      {issued && <IssuedCard issued={issued} />}
    </div>
  );
}

// Удалить сотрудника полностью. Сервер пустит, только если истории нет.
export function DeleteForeverForm({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState(deleteStaffForeverAction, INITIAL);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <ConfirmSubmit
        message={`Удалить ${name} полностью? Подходит, только если сотрудника завели по ошибке. Если у него уже есть занятия, смены или выплаты, система не даст удалить: такого увольняют датой.`}
        className={btnDanger}
      >
        {pending && <Spinner className="h-3.5 w-3.5" />}
        Удалить сотрудника полностью
      </ConfirmSubmit>
      <ErrorText text={state.error} />
    </form>
  );
}
