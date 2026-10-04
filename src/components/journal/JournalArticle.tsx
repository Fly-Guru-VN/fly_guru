import { dayLong, vnDay } from "@/lib/dates";
import { JOURNAL_SIGNATURE, type JournalBlock } from "@/lib/journal";
import { JournalPostBody } from "./JournalPostBody";

// Пост целиком: категория и дата, заголовок, тело, подпись внизу. Им рисуют и
// страницу поста на сайте, и предпросмотр в кабинете — одна вёрстка на двоих.
//
// Подписи («Источник», «изменено …») приходят готовыми строками: на сайте их
// переводит next-intl, а в кабинете всё и так по-русски.
export function JournalArticle({
  title,
  category,
  publishedAt,
  body,
  authorName,
  sourceName,
  sourceUrl,
  sourceLabel,
  editedText,
  editedAt,
}: {
  title: string;
  category: string | null;
  publishedAt: string;
  body: JournalBlock[];
  authorName: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  sourceLabel: string;
  editedText: string | null;
  editedAt: string | null;
}) {
  return (
    <div lang="ru">
      <p className="mt-6 flex flex-wrap items-center gap-x-2 text-sm font-semibold text-muted">
        {category && <span className="text-primary">{category}</span>}
        <time dateTime={publishedAt}>{dayLong(vnDay(publishedAt))}</time>
      </p>
      <h1 className="mt-2 text-3xl font-extrabold leading-tight sm:text-4xl">{title}</h1>

      <div className="mt-6">
        <JournalPostBody blocks={body} />
      </div>

      {/* Подпись и служебные пометки — внизу, как в Telegram: сначала читают
          сам пост, а кто и когда — потом. */}
      <footer className="mt-10 space-y-1 border-t border-line pt-5 text-sm text-muted">
        <p className="font-semibold text-ink">{authorName || JOURNAL_SIGNATURE}</p>
        {sourceName && (
          <p>
            {sourceLabel}:{" "}
            {sourceUrl ? (
              // nofollow: ссылка на источник — благодарность, а не
              // рекомендация, делиться с ним весом сайта незачем.
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-primary underline"
              >
                {sourceName}
              </a>
            ) : (
              sourceName
            )}
          </p>
        )}
        {editedText && editedAt && (
          <p>
            <time dateTime={editedAt}>{editedText}</time>
          </p>
        )}
      </footer>
    </div>
  );
}
