import { UpdatesFeed } from "@/components/cabinet/UpdatesFeed";
import { PageHeader } from "@/components/cabinet/PageHeader";

// «Обновления» — лента изменений для инструктора.
//
// Зачем экран: новые функции появлялись молча (инструктор о них просто не
// знал), а убранные так же молча исчезали и выглядели поломкой. Сами карточки
// рисует общий компонент — та же лента с теми же записями стоит у админа.
//
// Прочитанность запоминает меню (Sidebar) в localStorage телефона: заглянул
// на вкладку — красная точка гаснет.

export default function InstructorUpdatesPage() {
  return (
    <div>
      <PageHeader
        title="Обновления"
        hint="Что нового, что починили и что убрали. Свежее — сверху."
      />

      <UpdatesFeed />

      <p className="mt-8 text-xs text-muted">
        Не хватает чего-то или непонятно, куда делась кнопка, — скажите админу,
        добавим сюда.
      </p>
    </div>
  );
}
