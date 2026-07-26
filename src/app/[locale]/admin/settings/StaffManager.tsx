import { setSeniorAction } from "../actions";

// Кто на смене старший (0033). Серверный компонент: одна кнопка-тумблер на
// человека, никакого состояния на клиенте не нужно.
//
// Показываем ВСЕХ инструкторов сразу со статусом, а не только старших: админ
// должен видеть картину целиком — «сегодня старших двое» или «старшего нет
// вообще» (последнее означает, что оборудование утром никто не осматривает).

export interface StaffRow {
  id: string;
  name: string;
  senior: boolean;
}

export function StaffManager({ staff }: { staff: StaffRow[] }) {
  const seniorCount = staff.filter((s) => s.senior).length;

  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="font-bold">Инструкторы</h2>
      <p className="mt-1 text-xs text-muted">
        Старший утром осматривает и снимает доску с крылом. Остальные отмечаются
        одним фото, что они на пляже — выход им засчитывается так же.
      </p>

      {staff.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Инструкторов в базе пока нет.</p>
      ) : (
        <ul className="mt-3 space-y-1">
          {staff.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 odd:bg-line/20"
            >
              <span className="min-w-0 truncate text-sm">
                <span className="font-semibold">{s.name}</span>
                {s.senior && (
                  <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                    старший
                  </span>
                )}
              </span>
              <form action={setSeniorAction} className="shrink-0">
                <input type="hidden" name="id" value={s.id} />
                <input
                  type="hidden"
                  name="senior"
                  value={s.senior ? "false" : "true"}
                />
                <button
                  type="submit"
                  className="text-xs font-semibold text-muted transition-colors hover:text-primary"
                >
                  {s.senior ? "Снять старшинство" : "Сделать старшим"}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {staff.length > 0 && seniorCount === 0 && (
        <p className="mt-3 rounded-xl bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-700">
          Старших нет — сейчас доску и крыло снимает каждый, как раньше.
        </p>
      )}
    </section>
  );
}
