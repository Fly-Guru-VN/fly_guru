import { UpdatesFeed } from "@/components/cabinet/UpdatesFeed";
import { PageHeader } from "@/components/cabinet/PageHeader";
import { PageNote } from "@/components/cabinet/PageNote";

// Вкладка «Обновления» — одна и та же лента во всех кабинетах, теми же
// словами. Записи не фильтруем по кабинету: и админу, и СММщику нужно знать,
// что нового появилось у инструкторов (они же им это и объясняют), а метка на
// карточке сразу говорит, где искать изменение.
export function UpdatesScreen() {
  return (
    <div>
      <PageHeader title="Обновления" hint="Что нового в системе; свежее сверху" />
      <PageNote>
        Серая метка на карточке говорит, чьего кабинета касается правка.
      </PageNote>

      <UpdatesFeed />

      <p className="mt-8 text-xs text-muted">
        Эту же ленту инструкторы видят у себя во вкладке «Обновления».
      </p>
    </div>
  );
}
