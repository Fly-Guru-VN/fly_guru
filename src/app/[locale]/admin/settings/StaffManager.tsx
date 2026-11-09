import type { ReactNode } from "react";
import {
  closeSickLeaveAction,
  deleteSickLeaveAction,
  deleteStaffLoginAction,
  fireInstructorAction,
  openSickLeaveAction,
  rehireInstructorAction,
  setHiredAtAction,
  setNoSubsShareAction,
  setSeniorAction,
} from "../actions";
import type { AppRole } from "@/lib/auth";
import type { SickLeave } from "@/lib/staff";
import { ConfirmSubmit } from "../ConfirmSubmit";
import { DeleteForeverForm, LoginControls } from "./AccountControls";
import { TONE, btn, btnDanger, dateInput, fieldLabel, type BlockTone } from "./staffUi";

// Штат школы: кто работает, кто старший, кого уволили и с какого числа.
//
// Старший (0033) отвечает за утренний осмотр оборудования. С 27.07.2026 флаг
// ничего не требует от системы: смену все открывают одинаково (фото на пляже),
// а оборудование снимает тот, кому удобно. Пометка осталась как договорённость
// между людьми — кто за осмотр отвечает.
//
// Увольнение (0036) — это ДАТА, а не удаление строки. Живой случай: работали
// четверо, пятого числа одного уволили. Ему платят за отработанную неделю, и в
// базе должно остаться, что такой инструктор был и сколько он получил. Удалить
// строку нельзя: занятия потеряют инструктора, а прошлые расчёты ЗП станет не
// пересчитать. Поэтому здесь только даты первого и последнего рабочего дня, и
// от них зависит всё остальное — списки в формах, дележ абонементов, вход.
// Полностью удалить можно только того, у кого истории нет совсем (завели по
// ошибке): см. deleteStaffForeverAction.
//
// Тот же блок рисуется второй раз для СММщиков (kind="smm", с 01.10.2026) и
// третий — для механика (kind="mechanic", с 02.10.2026): даты у них те же, а
// старшинства нет — утренний осмотр досок не их забота.
//
// С 09.11.2026 (передача проекта начальнику) каждый человек — свёрнутая
// строка, а внутри цветные блоки по смыслу: «Работа», «Деньги», «Больничный»,
// «Вход в кабинет», «Опасная зона». Раньше всё висело открытым одинаковыми
// серыми ссылками, и было не понять, что безобидно, а что закрывает вход.

export interface StaffRow {
  id: string;
  role: AppRole;
  name: string;
  senior: boolean;
  hiredAt: string | null;
  leftAt: string | null;
  fired: boolean; // уволен по состоянию на сегодня
  label: string | null; // «уволен 5 авг» / «с 12 авг»
  hasLogin: boolean; // жив ли логин в Supabase Auth
  login: string | null; // что вводить в поле «Логин» (телефон или email)
  phone: string | null;
  sickLeaves: SickLeave[]; // больничные (0069), по возрастанию даты начала
  noSubsShareFrom: string | null; // без доли котла абонементов с этого дня (0070)
}

const TITLE = { instructor: "Инструкторы", smm: "СММ", mechanic: "Механик" };
const HINT = {
  instructor:
    "Нажмите на имя, чтобы открыть даты, деньги, больничный и вход в кабинет. Старший отвечает за утренний осмотр оборудования: это пометка для людей, смену все открывают одинаково.",
  smm: "Фикс за неделю и 1% с выручки начисляются только за дни между первым и последним рабочим днём.",
  mechanic:
    "Оклад за месяц начисляется только за дни между первым и последним рабочим днём.",
};
const NOBODY = {
  instructor: "Работающих инструкторов нет.",
  smm: "Работающего СММщика нет.",
  mechanic: "Работающего механика нет.",
};

const shortDay = (day: string) =>
  new Date(`${day}T00:00:00`).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
  });

const badge = "rounded-full px-2 py-0.5 text-[11px] font-semibold";

function Block({
  tone,
  title,
  hint,
  children,
}: {
  tone: BlockTone;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className={`rounded-xl border p-3 ${TONE[tone].box}`}>
      <h4 className={`text-sm font-bold ${TONE[tone].title}`}>{title}</h4>
      {hint && <p className="mt-0.5 text-xs text-slate-700">{hint}</p>}
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Chevron() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className="h-5 w-5 shrink-0 text-slate-500 transition-transform group-open:rotate-180"
    >
      <path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LoginBadge({ s }: { s: StaffRow }) {
  return s.hasLogin ? (
    <span className={`${badge} bg-indigo-100 text-indigo-800`}>вход есть</span>
  ) : (
    <span className={`${badge} bg-slate-200 text-slate-700`}>нет входа</span>
  );
}

// Блок «Вход в кабинет»: логин и кнопки. Общий для работающих и уволенных.
function LoginBlock({ s }: { s: StaffRow }) {
  return (
    <Block
      tone="login"
      title="Вход в кабинет"
      hint={
        s.hasLogin
          ? "Пароль система не хранит. Сотрудник забыл: выдайте новый, он покажется один раз."
          : s.fired
            ? "Входа нет. Уволенный всё равно не смог бы войти."
            : "Входа нет: в кабинет сотрудник попасть не может."
      }
    >
      {s.hasLogin && (
        <p className="text-sm text-ink">
          Логин:{" "}
          <span className="font-mono font-semibold">{s.login ?? "не указан"}</span>
          <span className="text-xs text-slate-600"> · вход на сайте, страница /login</span>
        </p>
      )}
      {!s.fired && (
        <LoginControls
          id={s.id}
          name={s.name}
          hasLogin={s.hasLogin}
          phone={s.phone}
          canCreate={!s.fired}
        />
      )}
    </Block>
  );
}

function DeleteLoginForm({ s }: { s: StaffRow }) {
  if (!s.hasLogin) return null;
  return (
    <form action={deleteStaffLoginAction}>
      <input type="hidden" name="id" value={s.id} />
      <ConfirmSubmit
        message={`Удалить вход ${s.name}? Войти в кабинет он больше не сможет, сразу. Занятия, смены и выплаты останутся. Если понадобится, вход можно создать заново в этой же карточке.`}
        className={btnDanger}
      >
        Удалить вход
      </ConfirmSubmit>
    </form>
  );
}

export function StaffManager({
  kind,
  staff,
  today,
}: {
  kind: "instructor" | "smm" | "mechanic";
  staff: StaffRow[];
  today: string;
}) {
  const withSenior = kind === "instructor";
  const working = staff.filter((s) => !s.fired);
  const seniorCount = working.filter((s) => s.senior).length;
  const fired = staff.filter((s) => s.fired);

  return (
    <section className="rounded-2xl border border-slate-300 bg-surface p-4">
      <h2 className="text-lg font-bold text-ink">{TITLE[kind]}</h2>
      <p className="mt-1 text-xs text-slate-700">{HINT[kind]}</p>

      {working.length === 0 ? (
        <p className="mt-3 text-sm text-slate-700">{NOBODY[kind]}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {working.map((s) => (
            <li key={s.id}>
              <details className="group rounded-xl border border-slate-300 bg-white open:shadow-sm">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 py-2.5 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                  <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-ink">{s.name}</span>
                    {withSenior && s.senior && (
                      <span className={`${badge} bg-sky-100 text-sky-800`}>старший</span>
                    )}
                    {openLeave(s) && (
                      <span className={`${badge} bg-amber-100 text-amber-800`}>
                        на больничном с {shortDay(openLeave(s)!.from)}
                      </span>
                    )}
                    {s.noSubsShareFrom && (
                      <span className={`${badge} bg-emerald-100 text-emerald-800`}>
                        без доли с абонементов
                      </span>
                    )}
                    {s.label && <span className="text-xs text-slate-600">{s.label}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <LoginBadge s={s} />
                    <Chevron />
                  </span>
                </summary>

                <div className="grid gap-3 border-t border-slate-200 p-3 lg:grid-cols-2">
                  <Block tone="work" title="Работа">
                    <WorkControls s={s} withSenior={withSenior} />
                  </Block>

                  {kind === "instructor" && (
                    <Block tone="money" title="Деньги: доля с абонементов">
                      <SubsShareControls s={s} today={today} />
                    </Block>
                  )}

                  {kind === "instructor" && (
                    <Block
                      tone="sick"
                      title="Больничный"
                      hint="На больничном нет доли с абонементов и нельзя открыть смену."
                    >
                      <SickLeaveControls s={s} today={today} />
                    </Block>
                  )}

                  <LoginBlock s={s} />

                  <div className="lg:col-span-2">
                    <Block
                      tone="danger"
                      title="Опасная зона"
                      hint="Эти действия закрывают человеку кабинет. Перед каждым система переспросит."
                    >
                      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
                        <form action={fireInstructorAction} className="flex flex-wrap items-end gap-2">
                          <input type="hidden" name="id" value={s.id} />
                          <label className={fieldLabel}>
                            Последний рабочий день
                            <input
                              type="date"
                              name="lastDay"
                              defaultValue={s.leftAt ?? today}
                              required
                              className={dateInput}
                            />
                          </label>
                          <ConfirmSubmit
                            message={`Уволить ${s.name}? С указанного последнего рабочего дня он пропадёт из списков и не сможет войти в кабинет: сегодняшнее число — сразу, будущее — доработает до него. Занятия, смены и расчёт ЗП за отработанные дни останутся на месте.`}
                            className={btnDanger}
                          >
                            Уволить
                          </ConfirmSubmit>
                        </form>
                        <DeleteLoginForm s={s} />
                        <DeleteForeverForm id={s.id} name={s.name} />
                      </div>
                    </Block>
                  </div>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}

      {withSenior && working.length > 0 && seniorCount === 0 && (
        <p className="mt-3 text-xs text-slate-700">
          Старший не назначен — доски снимет тот, кому удобно. На открытие смены
          это не влияет.
        </p>
      )}

      {fired.length > 0 && (
        <div className="mt-5 border-t border-slate-300 pt-3">
          <h3 className="text-sm font-bold text-slate-800">Уволенные</h3>
          <p className="mt-1 text-xs text-slate-700">
            Из базы не удалены: их занятия и выплаты видны в статистике и в
            «Расчёте выплат» за прошлые периоды. «Удалить вход» стирает только
            логин, история остаётся.
          </p>
          <ul className="mt-2 space-y-2">
            {fired.map((s) => (
              <li key={s.id}>
                <details className="group rounded-xl border border-slate-200 bg-slate-50">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 py-2 hover:bg-slate-100 [&::-webkit-details-marker]:hidden">
                    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-slate-700">{s.name}</span>
                      <span className="text-xs text-slate-600">{s.label}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <LoginBadge s={s} />
                      <Chevron />
                    </span>
                  </summary>
                  <div className="grid gap-3 border-t border-slate-200 p-3 lg:grid-cols-2">
                    <Block tone="work" title="Работа">
                      <form action={rehireInstructorAction}>
                        <input type="hidden" name="id" value={s.id} />
                        <button type="submit" className={btn}>
                          Вернуть в штат
                        </button>
                      </form>
                    </Block>
                    <LoginBlock s={s} />
                    <div className="lg:col-span-2">
                      <Block tone="danger" title="Опасная зона">
                        <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
                          <DeleteLoginForm s={s} />
                          <DeleteForeverForm id={s.id} name={s.name} />
                        </div>
                      </Block>
                    </div>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// Первый рабочий день (от него идёт доля с абонементов у новичка) и
// старшинство. Увольнение — в «Опасной зоне»: оно закрывает вход.
function WorkControls({ s, withSenior }: { s: StaffRow; withSenior: boolean }) {
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
      <form action={setHiredAtAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="id" value={s.id} />
        <label className={fieldLabel}>
          Первый рабочий день
          <input
            type="date"
            name="hiredAt"
            defaultValue={s.hiredAt ?? ""}
            className={dateInput}
          />
        </label>
        <button type="submit" className={btn}>
          Сохранить
        </button>
      </form>
      {withSenior && (
        <form action={setSeniorAction}>
          <input type="hidden" name="id" value={s.id} />
          <input type="hidden" name="senior" value={s.senior ? "false" : "true"} />
          <button type="submit" className={btn}>
            {s.senior ? "Снять старшинство" : "Сделать старшим"}
          </button>
        </form>
      )}
    </div>
  );
}

const openLeave = (s: StaffRow) => s.sickLeaves.find((l) => l.to === null) ?? null;

// Больничный (0069, решение David от 13.10.2026). Только у инструкторов.
// Открывают датой начала — когда человек выздоровеет, заранее неизвестно. С
// этого дня ему не идёт доля котла абонементов, и смену он открыть не может.
// Закрывают днём, когда он ВЫШЕЛ на работу: этот день уже рабочий.
function SickLeaveControls({ s, today }: { s: StaffRow; today: string }) {
  const open = openLeave(s);
  const past = s.sickLeaves.filter((l) => l.to !== null);
  // Новый больничный не может начаться раньше конца прошлого.
  const lastEnd = past.length > 0 ? past[past.length - 1].to! : null;

  return (
    <div>
      {open ? (
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          <form action={closeSickLeaveAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="leaveId" value={open.id} />
            <label className={fieldLabel}>
              Вышел на работу
              <input
                type="date"
                name="backDay"
                defaultValue={today}
                min={open.from}
                required
                className={dateInput}
              />
            </label>
            <button type="submit" className={btn}>
              Закрыть больничный
            </button>
          </form>
          <form action={deleteSickLeaveAction}>
            <input type="hidden" name="leaveId" value={open.id} />
            <ConfirmSubmit
              message={`Удалить больничный ${s.name} целиком? Все его дни снова станут рабочими, и доля с абонементов за них вернётся. Нужно, только если больничный открыли по ошибке.`}
              className={btnDanger}
            >
              Удалить (открыт по ошибке)
            </ConfirmSubmit>
          </form>
        </div>
      ) : (
        <form action={openSickLeaveAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={s.id} />
          <label className={fieldLabel}>
            Больничный с
            <input
              type="date"
              name="from"
              defaultValue={today}
              min={lastEnd ? nextDay(lastEnd) : undefined}
              required
              className={dateInput}
            />
          </label>
          <ConfirmSubmit
            message={`Открыть больничный ${s.name}? С этой даты и до закрытия больничного ему не идёт доля с абонементов (её делят остальные), и он не сможет открыть смену.`}
            className={btn}
          >
            Открыть больничный
          </ConfirmSubmit>
        </form>
      )}

      {past.length > 0 && (
        // div, а не p: внутри формы-крестики, а <form> в <p> ломает гидратацию.
        <div className="mt-2 text-xs text-slate-700">
          Прошлые больничные:{" "}
          {past.map((l, i) => (
            <span key={l.id}>
              {i > 0 && ", "}
              {l.from === l.to
                ? shortDay(l.from)
                : `${shortDay(l.from)} – ${shortDay(l.to!)}`}
              <form action={deleteSickLeaveAction} className="inline">
                <input type="hidden" name="leaveId" value={l.id} />
                <ConfirmSubmit
                  message={`Удалить больничный ${s.name}? Его дни снова станут рабочими, и доля с абонементов за них вернётся.`}
                  className="ml-1 font-bold text-red-700 hover:text-red-900"
                >
                  ×
                </ConfirmSubmit>
              </form>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Без доли котла абонементов (0070, решение David от 20.10.2026). Условия
// человека, а не событие: с выбранного дня абонементы делятся без него, ему
// остаются только свои выходы. Дата нужна, чтобы не пересчитать задним числом
// уже выплаченные недели.
function SubsShareControls({ s, today }: { s: StaffRow; today: string }) {
  return s.noSubsShareFrom ? (
    <form action={setNoSubsShareAction} className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <input type="hidden" name="id" value={s.id} />
      <input type="hidden" name="from" value="" />
      <span className="text-sm text-ink">
        Без доли с {shortDay(s.noSubsShareFrom)}: получает только за свои выходы
      </span>
      <ConfirmSubmit
        message={`Вернуть ${s.name} долю с абонементов? Расчёт станет как у всех, в том числе за дни с ${shortDay(s.noSubsShareFrom)}: если эти недели уже выплачены, суммы в них изменятся.`}
        className={btn}
      >
        Вернуть долю
      </ConfirmSubmit>
    </form>
  ) : (
    <form action={setNoSubsShareAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={s.id} />
      <span className="w-full text-xs text-slate-700">
        Сейчас получает долю 15% с абонементов, как все.
      </span>
      <label className={fieldLabel}>
        Не давать долю с
        <input type="date" name="from" defaultValue={today} required className={dateInput} />
      </label>
      <ConfirmSubmit
        message={`${s.name} больше не получает долю с абонементов? С этой даты 15% с абонементов делят остальные, а ему идут только свои выходы: 200 000 ₫ за смену и 15% с занятий дня.`}
        className={btn}
      >
        Не давать долю
      </ConfirmSubmit>
    </form>
  );
}

function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
