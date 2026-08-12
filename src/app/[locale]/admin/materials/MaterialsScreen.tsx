// Экран «Материалы» — общий для админа и СММщика (кабинет /smm). Логика одна:
// вторая копия шпаргалки с рекламными ссылками разъехалась бы в первый же день.
// Ссылок на конкретный кабинет здесь нет, поэтому базовый путь не нужен.
import { createClient } from "@/lib/supabase/server";
import { CopyLink } from "../CopyLink";
import { ConfirmSubmit } from "../ConfirmSubmit";
import { deleteMaterialAction } from "../actions";
import { MaterialCreateForm, MaterialEditForm } from "./MaterialForms";
import { PageHeader } from "@/components/cabinet/PageHeader";
import { PageNote } from "@/components/cabinet/PageNote";

// Шпаргалка владельца: готовые меченые ссылки для рекламы. Метка ?src=
// приклеивается к гостю на 30 дней (lib/attribution.ts) и приходит вместе
// с его заявкой — так видно, какой канал реально приводит людей.
// Каналы живут в таблице materials (0009) — админ добавляет и правит их сам.
// Плюс реф-ссылки активных агентов — раздать не заходя в «Агентов».

interface MaterialRow {
  id: string;
  label: string;
  hint: string | null;
  src: string;
}

interface AgentLinkRow {
  id: string;
  ref_code: string;
  user: { name: string } | null;
}

export async function MaterialsScreen() {
  const supabase = await createClient();
  const [materialsRes, agentsRes] = await Promise.all([
    supabase
      .from("materials")
      .select("id, label, hint, src")
      .order("created_at", { ascending: true }),
    supabase
      .from("agents")
      .select("id, ref_code, user:users!user_id(name)")
      .eq("active", true),
  ]);

  const materials = (materialsRes.data ?? []) as MaterialRow[];
  const agents = ((agentsRes.data ?? []) as unknown as AgentLinkRow[]).sort(
    (a, b) => (a.user?.name ?? "").localeCompare(b.user?.name ?? "", "ru"),
  );

  return (
    <div>
      <PageHeader
        title="Материалы"
        hint="Готовые ссылки для рекламы"
      />
      <PageNote>Метка из ссылки держится за гостем 30 дней и видна в его заявке — так понятно, какой канал сработал.</PageNote>

      <section className="mt-4 rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-bold">Каналы</h2>
        {materials.length === 0 && (
          <p className="mt-3 text-sm text-muted">
            Каналов пока нет — добавьте первый ниже.
          </p>
        )}
        <div className="mt-3 space-y-4">
          {materials.map((m) => (
            <div key={m.id}>
              <p className="text-sm font-semibold">
                {m.label}
                {m.hint && <span className="font-normal text-muted"> · {m.hint}</span>}
              </p>
              <div className="mt-1">
                <CopyLink path={`/?src=${m.src}`} />
              </div>
              <details className="mt-1">
                <summary className="cursor-pointer list-none text-xs font-semibold text-muted hover:text-primary [&::-webkit-details-marker]:hidden">
                  Править ▾
                </summary>
                <div className="mt-2 rounded-xl border border-line/70 p-3">
                  <MaterialEditForm material={m} />
                  <form action={deleteMaterialAction} className="mt-2">
                    <input type="hidden" name="id" value={m.id} />
                    <ConfirmSubmit
                      message={`Удалить канал «${m.label}»? Ссылка перестанет раздаваться отсюда; уже пришедшие заявки метку сохранят.`}
                      className="text-xs font-semibold text-muted transition-colors hover:text-red-500"
                    >
                      Удалить канал
                    </ConfirmSubmit>
                  </form>
                </div>
              </details>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-bold">Новый канал</h2>
        <p className="mt-1 text-xs text-muted">
          Придумайте метку — и раздавайте ссылку в новом месте: баннер, чат,
          обзорщик. Заявки с неё будут подписаны этой меткой.
        </p>
        <div className="mt-3">
          <MaterialCreateForm />
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-bold">Ссылки агентов</h2>
        <p className="mt-1 text-xs text-muted">
          Личные ссылки активных агентов — гость по ним получает скидку 200 000 ₫.
        </p>
        {agents.length === 0 && (
          <p className="mt-3 text-sm text-muted">Активных агентов нет.</p>
        )}
        <div className="mt-3 space-y-3">
          {agents.map((a) => (
            <div key={a.id}>
              <p className="text-sm font-semibold">{a.user?.name ?? "агент"}</p>
              <div className="mt-1">
                <CopyLink path={`/r/${a.ref_code}`} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
