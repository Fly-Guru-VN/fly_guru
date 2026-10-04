import Image from "next/image";
import {
  inlineSegments,
  journalPhotoUrl,
  paragraphs,
  type JournalBlock,
} from "@/lib/journal";
import { JournalVideo } from "./JournalVideo";

// Тело поста: блоки по порядку. Один компонент на страницу поста и
// предпросмотр в кабинете — чтобы предпросмотр не врал о том, как пост будет
// выглядеть на сайте.
//
// Текст выводится как текст: React экранирует его сам, HTML из базы сюда не
// попадает никогда. Ссылки собираются из разметки [текст](адрес), и адрес
// проверен заранее (lib/journal, safeHref).
export function JournalPostBody({ blocks }: { blocks: JournalBlock[] }) {
  // Первое фото поста — обычно в первом экране, грузим его сразу.
  const firstPhoto = blocks.findIndex((b) => b.type === "photo");
  return (
    <div className="space-y-5 text-[1.0625rem] leading-relaxed text-ink">
      {blocks.map((block, i) => {
        switch (block.type) {
          case "text":
            return paragraphs(block.text).map((p, j) => (
              // whitespace-pre-line: одиночный перенос внутри абзаца остаётся
              // переносом — так пишут в Telegram, и так это ждут увидеть.
              <p key={`${i}-${j}`} className="whitespace-pre-line">
                <InlineText text={p} />
              </p>
            ));
          case "heading":
            return (
              <h2 key={i} className="pt-3 text-2xl font-bold leading-snug">
                {block.text}
              </h2>
            );
          case "list": {
            const List = block.ordered ? "ol" : "ul";
            return (
              <List
                key={i}
                className={`space-y-1.5 pl-6 ${block.ordered ? "list-decimal" : "list-disc"} marker:text-primary`}
              >
                {block.items.map((item, j) => (
                  <li key={j}>
                    <InlineText text={item} />
                  </li>
                ))}
              </List>
            );
          }
          case "photo":
            return (
              <figure key={i}>
                <Image
                  src={journalPhotoUrl(block.path)}
                  alt={block.caption ?? ""}
                  width={block.w}
                  height={block.h}
                  // Колонка текста не шире 720 px — больше телефону и ноутбуку
                  // не отдаём, next/image сам подберёт размер и формат.
                  sizes="(max-width: 768px) 100vw, 720px"
                  priority={i === firstPhoto}
                  // Вертикальный кадр с телефона во всю ширину колонки занял
                  // бы полтора экрана — ограничиваем высоту, ширина
                  // подстраивается.
                  className="mx-auto h-auto max-h-[85vh] w-auto max-w-full rounded-2xl bg-surface-2"
                />
                {block.caption && (
                  <figcaption className="mt-2 text-center text-sm text-muted">
                    {block.caption}
                  </figcaption>
                )}
              </figure>
            );
          case "video":
            return <JournalVideo key={i} id={block.id} vertical={block.vertical} />;
        }
      })}
    </div>
  );
}

function InlineText({ text }: { text: string }) {
  return (
    <>
      {inlineSegments(text).map((segment, i) => {
        if (!segment.href) return segment.text;
        // Свой адрес (/training) открываем тут же, чужой — в новой вкладке.
        const external = !segment.href.startsWith("/");
        return (
          <a
            key={i}
            href={segment.href}
            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="font-medium text-primary underline underline-offset-2 hover:text-primary-strong"
          >
            {segment.text}
          </a>
        );
      })}
    </>
  );
}
