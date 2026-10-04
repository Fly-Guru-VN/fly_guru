// Экраны журнала — общие для админа (с ним разработчик) и СММщика, как
// «Материалы»: вторая копия разъехалась бы в первый же день. Разница только в
// базовом пути ссылок (/admin или /smm), его передаёт страница.
//
// Читаем своим ключом: черновики видит только офис (политика 0064), и
// уволенному с живой сессией база ничего не отдаст.
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { failIfReadError } from "@/lib/dbError";
import { isUuid } from "@/lib/photos";
import { vnEnteredLabel } from "@/lib/dates";
import { JOURNAL_STATUS_LABEL, parseBody, type JournalStatus } from "@/lib/journal";
import { PageHeader } from "@/components/cabinet/PageHeader";
import { PageNote } from "@/components/cabinet/PageNote";
import { JournalEditor, type EditorCategory } from "./JournalEditor";

const STATUS_CHIP: Record<JournalStatus, string> = {
  draft: "bg-line/60 text-ink",
  published: "bg-emerald-100 text-emerald-800",
  hidden: "bg-amber-100 text-amber-800",
};

interface ListRow {
  id: string;
  title: string;
  status: JournalStatus;
  updated_at: string;
  category: { name: string } | null;
}

export async function JournalListScreen({ base }: { base: string }) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("journal_posts")
    .select("id, title, status, updated_at, category:journal_categories(name)")
    .order("updated_at", { ascending: false });
  failIfReadError(error, "не удалось прочитать журнал");
  const posts = (data ?? []) as unknown as ListRow[];

  return (
    <div>
      <PageHeader
        title="Журнал"
        hint="Статьи, посты и новости на сайте"
        action={
          <Link
            href={`${base}/journal/new`}
            className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong"
          >
            + Новый
          </Link>
        }
      />
      <PageNote>
        Черновик видите только вы и коллеги в кабинете. После «Опубликовать» пост через несколько
        секунд появляется на сайте в разделе «Журнал», а поисковик найдёт его через карту сайта.
        Скрытый пост пропадает с сайта, но остаётся здесь.
      </PageNote>

      {posts.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">
          Материалов пока нет — напишите первый.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {posts.map((post) => (
            <li key={post.id}>
              <Link
                href={`${base}/journal/${post.id}`}
                className="flex items-start gap-3 px-4 py-3 hover:bg-line/30"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{post.title}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {post.category?.name ?? "Без категории"} · изменён{" "}
                    {vnEnteredLabel(post.updated_at)}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_CHIP[post.status]}`}
                >
                  {JOURNAL_STATUS_LABEL[post.status]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

async function loadCategories(): Promise<EditorCategory[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("journal_categories")
    .select("id, name, hidden")
    .order("sort")
    .order("name");
  failIfReadError(error, "не удалось прочитать категории журнала");
  return (data ?? []) as EditorCategory[];
}

export async function JournalNewScreen({ base }: { base: string }) {
  const categories = await loadCategories();
  return (
    <div>
      <PageHeader title="Новый материал" action={<BackLink base={base} />} />
      <div className="mt-4">
        <JournalEditor base={base} categories={categories} post={null} />
      </div>
    </div>
  );
}

export async function JournalEditScreen({ base, id }: { base: string; id: string }) {
  if (!isUuid(id)) notFound();
  const supabase = await createClient();
  const [categories, { data, error }] = await Promise.all([
    loadCategories(),
    supabase
      .from("journal_posts")
      .select("id, slug, title, body, category_id, status, updated_at")
      .eq("id", id)
      .maybeSingle(),
  ]);
  failIfReadError(error, "не удалось прочитать пост");
  if (!data) notFound();

  return (
    <div>
      <PageHeader title="Редактирование" action={<BackLink base={base} />} />
      <div className="mt-4">
        <JournalEditor
          base={base}
          categories={categories}
          post={{
            id: data.id as string,
            slug: data.slug as string,
            title: data.title as string,
            body: parseBody(data.body),
            categoryId: (data.category_id as string | null) ?? null,
            status: data.status as JournalStatus,
            updatedAt: data.updated_at as string,
          }}
        />
      </div>
    </div>
  );
}

function BackLink({ base }: { base: string }) {
  return (
    <Link href={`${base}/journal`} className="text-sm font-semibold text-primary hover:underline">
      ← Все материалы
    </Link>
  );
}
