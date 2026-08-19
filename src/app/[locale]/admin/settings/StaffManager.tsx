import {
  fireInstructorAction,
  rehireInstructorAction,
  setHiredAtAction,
  setSeniorAction,
} from "../actions";
import { NATIVE_PICKER } from "@/components/cabinet/fieldClasses";
import { ConfirmSubmit } from "../ConfirmSubmit";

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

export interface StaffRow {
  id: string;
  name: string;
  senior: boolean;
  hiredAt: string | null;
  leftAt: string | null;
  fired: boolean; // уволен по состоянию на сегодня
  label: string | null; // «уволен 5 авг» / «с 12 авг»
}

const dateClass = `${NATIVE_PICKER} rounded-lg border border-line bg-surface px-2 py-1 text-xs outline-none focus:border-primary`;
const linkClass =
  "text-xs font-semibold text-muted transition-colors hover:text-primary";

export function StaffManager({
  staff,
  today,
}: {
  staff: StaffRow[];
  today: string;
}) {
  const working = staff.filter((s) => !s.fired);
  const seniorCount = working.filter((s) => s.senior).length;
  const fired = staff.filter((s) => s.fired);

  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="font-bold">Инструкторы</h2>
      <p className="mt-1 text-xs text-muted">
        Старший отвечает за утренний осмотр оборудования. Это пометка для людей:
        смену все открывают одинаково — одним фото на пляже, а доску с крылом
        снимает тот, кому в этот день удобно.
      </p>

      {staff.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Инструкторов в базе пока нет.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {working.map((s) => (
            <li key={s.id} className="rounded-xl px-3 py-2 odd:bg-line/20">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 text-sm">
                  <span className="font-semibold">{s.name}</span>
                  {s.senior && (
                    <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                      старший
                    </span>
                  )}
                  {s.label && (
                    <span className="ml-2 text-[11px] text-muted">{s.label}</span>
                  )}
                </span>
                <form action={setSeniorAction} className="shrink-0">
                  <input type="hidden" name="id" value={s.id} />
                  <input
                    type="hidden"
                    name="senior"
                    value={s.senior ? "false" : "true"}
                  />
                  <button type="submit" className={linkClass}>
                    {s.senior ? "Снять старшинство" : "Сделать старшим"}
                  </button>
                </form>
              </div>

              {/* Обе даты рядом: слева «с какого числа работает» (от неё идёт
                  доля с абонементов у новичка), справа увольнение. Сегодняшняя
                  дата в увольнении = человек уходит из штата сразу, будущая =
                  «последний день пятница». ЗП за сам этот день начисляется в
                  обоих случаях. */}
              <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2">
                <form action={setHiredAtAction} className="flex items-end gap-1.5">
                  <input type="hidden" name="id" value={s.id} />
                  <label className="text-[11px] text-muted">
                    Первый рабочий день
                    <input
                      type="date"
                      name="hiredAt"
                      defaultValue={s.hiredAt ?? ""}
                      className={`mt-0.5 block ${dateClass}`}
                    />
                  </label>
                  <button type="submit" className={`${linkClass} pb-1.5`}>
                    Сохранить
                  </button>
                </form>

                <form action={fireInstructorAction} className="flex items-end gap-1.5">
                  <input type="hidden" name="id" value={s.id} />
                  <label className="text-[11px] text-muted">
                    Последний рабочий день
                    <input
                      type="date"
                      name="lastDay"
                      defaultValue={s.leftAt ?? today}
                      required
                      className={`mt-0.5 block ${dateClass}`}
                    />
                  </label>
                  <ConfirmSubmit
                    message={`Уволить ${s.name}? С указанного последнего рабочего дня он пропадёт из списков и не сможет войти в кабинет: сегодняшнее число — сразу, будущее — доработает до него. Занятия, смены и расчёт ЗП за отработанные дни останутся на месте.`}
                    className={`${linkClass} pb-1.5 hover:text-red-600`}
                  >
                    Уволить
                  </ConfirmSubmit>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      {working.length > 0 && seniorCount === 0 && (
        <p className="mt-3 text-xs text-muted">
          Старший не назначен — доски снимет тот, кому удобно. На открытие смены
          это не влияет.
        </p>
      )}

      {fired.length > 0 && (
        <div className="mt-5 border-t border-line pt-3">
          <h3 className="text-sm font-semibold text-muted">Уволенные</h3>
          <p className="mt-1 text-xs text-muted">
            Из базы не удалены: их занятия и выплаты видны в статистике и в
            «Расчёте выплат» за прошлые периоды.
          </p>
          <ul className="mt-2 space-y-1">
            {fired.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 odd:bg-line/20"
              >
                <span className="min-w-0 text-sm">
                  <span className="font-semibold">{s.name}</span>
                  <span className="ml-2 text-[11px] text-muted">{s.label}</span>
                </span>
                <form action={rehireInstructorAction} className="shrink-0">
                  <input type="hidden" name="id" value={s.id} />
                  <button type="submit" className={linkClass}>
                    Вернуть в штат
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
