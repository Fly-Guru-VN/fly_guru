// Бегущая строка фактов под первым экраном.
//
// Список едет по кругу: внутри лежит несколько одинаковых копий фактов, лента
// сдвигается ровно на одну копию и начинает заново — стыка не видно. Копии,
// кроме первой, скрыты от читалок (aria-hidden), иначе факты озвучивались бы
// по нескольку раз.
//
// Копий четыре: пока лента едет, экран должны закрывать три оставшиеся. Двух
// копий (сдвиг на половину) хватает, только если одна копия шире экрана, а у
// нас она ~1200 px — на широком мониторе в конце круга справа выезжала пустота
// и строка «продлевалась» с задержкой.
//
// Движение останавливается при системном «уменьшении движения» (см. globals.css)
// — тогда это просто строка фактов.
const COPIES = 4;

export function Marquee({ items }: { items: string[] }) {
  const copy = (
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
        {copy}
        {Array.from({ length: COPIES - 1 }, (_, i) => (
          <div key={i} aria-hidden className="flex">
            {copy}
          </div>
        ))}
      </div>
    </div>
  );
}
