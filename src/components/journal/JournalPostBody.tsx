import Image from "next/image";
import { journalPhotoUrl, paragraphs, type JournalBlock } from "@/lib/journal";

// Тело поста: блоки по порядку. Один компонент на страницу поста и (на этапе 2)
// предпросмотр в кабинете — чтобы предпросмотр не врал о том, как пост будет
// выглядеть на сайте.
//
// Текст выводится как текст: React экранирует его сам, HTML из базы сюда не
// попадает никогда (см. lib/journal, parseBody).
export function JournalPostBody({ blocks }: { blocks: JournalBlock[] }) {
  return (
    <div className="space-y-5 text-[1.0625rem] leading-relaxed text-ink">
      {blocks.map((block, i) =>
        block.type === "text" ? (
          paragraphs(block.text).map((p, j) => (
            // whitespace-pre-line: одиночный перенос внутри абзаца остаётся
            // переносом — так пишут в Telegram, и так это ждут увидеть.
            <p key={`${i}-${j}`} className="whitespace-pre-line">
              {p}
            </p>
          ))
        ) : (
          <Image
            key={i}
            src={journalPhotoUrl(block.path)}
            alt=""
            width={block.w}
            height={block.h}
            // Колонка текста не шире 720 px — больше телефону и ноутбуку не
            // отдаём, next/image сам подберёт размер и формат.
            sizes="(max-width: 768px) 100vw, 720px"
            // Первое фото обычно и есть обложка в первом экране.
            priority={i === 0}
            // Вертикальный кадр с телефона во всю ширину колонки занял бы
            // полтора экрана — ограничиваем высоту, ширина подстраивается.
            className="mx-auto h-auto max-h-[85vh] w-auto max-w-full rounded-2xl bg-surface-2"
          />
        ),
      )}
    </div>
  );
}
