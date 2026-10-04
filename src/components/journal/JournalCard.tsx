import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { dayLong, vnDay } from "@/lib/dates";
import { excerpt, journalPhotoUrl } from "@/lib/journal";
import type { JournalCard as JournalCardData } from "@/lib/journalData";

// Карточка материала в ленте журнала: обложка, категория, дата, заголовок и
// начало текста. Короткий пост без фото — та же карточка без картинки, а не
// «пустая рамка»: фото в журнале необязательно.
export function JournalCard({ post }: { post: JournalCardData }) {
  const summary = excerpt(post.excerptSource, 140);
  return (
    <Link
      href={`/journal/${post.slug}`}
      className="group flex flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-[0_18px_40px_-30px_rgba(15,34,51,0.5)] transition-shadow hover:shadow-[0_22px_46px_-28px_rgba(15,34,51,0.6)]"
    >
      {post.coverPath && (
        <div className="relative aspect-[4/3] overflow-hidden bg-surface-2">
          <Image
            src={journalPhotoUrl(post.coverPath)}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 360px"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        </div>
      )}
      <div className="flex flex-1 flex-col p-5" lang="ru">
        <p className="flex flex-wrap items-center gap-x-2 text-xs font-semibold text-muted">
          {post.category && <span className="text-primary">{post.category}</span>}
          <time dateTime={post.publishedAt}>{dayLong(vnDay(post.publishedAt))}</time>
        </p>
        <h2 className="mt-2 text-lg font-bold leading-snug group-hover:text-primary">
          {post.title}
        </h2>
        {summary && <p className="mt-2 line-clamp-3 text-sm text-muted">{summary}</p>}
      </div>
    </Link>
  );
}
