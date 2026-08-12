// Мгновенный скелетон при переходах по кабинету: страницы серверные и ходят
// в базу, без этого экран замирает без всякой реакции на нажатие.
export default function SmmLoading() {
  return (
    <div aria-busy="true" className="animate-pulse">
      <div className="h-7 w-40 rounded-lg bg-line/60" />
      <div className="mt-2 h-4 w-64 rounded bg-line/40" />
      <div className="mt-6 space-y-3">
        <div className="h-28 rounded-2xl bg-line/40" />
        <div className="h-28 rounded-2xl bg-line/30" />
        <div className="h-28 rounded-2xl bg-line/20" />
      </div>
    </div>
  );
}
