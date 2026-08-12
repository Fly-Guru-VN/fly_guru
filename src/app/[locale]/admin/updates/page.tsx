import { UpdatesFeed } from "@/components/cabinet/UpdatesFeed";
import { PageHeader } from "@/components/cabinet/PageHeader";
import { PageNote } from "@/components/cabinet/PageNote";

// «Обновления» в админке — та же лента, что видит инструктор, теми же словами.
// Записи не фильтруем по кабинету: админу нужно знать, что нового появилось у
// инструкторов (он же им это и объясняет по телефону), а метка на карточке
// сразу говорит, где именно искать изменение.

export default function AdminUpdatesPage() {
  return (
    <div>
      <PageHeader
        title="Обновления"
        hint="Что нового в системе; свежее сверху"
      />
      <PageNote>Серая метка на карточке говорит, чьего кабинета касается правка.</PageNote>

      <UpdatesFeed />

      <p className="mt-8 text-xs text-muted">
        Эту же ленту инструкторы видят у себя во вкладке «Обновления».
      </p>
    </div>
  );
}
