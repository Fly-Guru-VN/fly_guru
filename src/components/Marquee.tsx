// Бегущая строка фактов под первым экраном.
//
// Список едет по кругу: внутри две одинаковые половины, лента сдвигается ровно
// на половину длины и начинает заново — стыка не видно. Вторая половина скрыта
// от читалок (aria-hidden), иначе факты озвучивались бы дважды.
//
// Движение останавливается при системном «уменьшении движения» (см. globals.css)
// — тогда это просто строка фактов.
export function Marquee({ items }: { items: string[] }) {
  const half = (
    <ul className="flex shrink-0 items-center gap-3 pr-3">
      {items.map((t) => (
        <li key={t} className="flex items-center gap-3 whitespace-nowrap">
          <span className="text-sm font-semibold text-primary-strong">{t}</span>
          <span aria-hidden className="text-accent">
            ●
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="overflow-hidden border-y border-line bg-primary/5 py-3">
      <div className="animate-marquee flex w-max">
        {half}
        <div aria-hidden>{half}</div>
      </div>
    </div>
  );
}
