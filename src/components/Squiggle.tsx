// Маленький росчерк воды под надстрочником и заголовками — как в макетах.
// Вместо жирной линии-разделителя: тот же приём, что на главной в блоке шагов.
//
// long — вдвое длиннее: не растянутый, а с вдвое большим числом волн, высота
// та же. Растяжением волны стали бы пологими и росчерк потерял бы характер.
export function Squiggle({ className = "", long = false }: { className?: string; long?: boolean }) {
  // Первая пара волн, дальше — повторы по две (вверх и вниз) той же ширины.
  const start = "M2 6c4-5 8-5 12 0s8 5 12 0";
  const pair = " 8-5 12 0 8 5 12 0";
  return (
    <svg
      aria-hidden
      viewBox={long ? "0 0 128 10" : "0 0 64 10"}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={`h-2.5 text-primary/50 ${long ? "w-32" : "w-16"} ${className}`}
    >
      <path d={start + pair.repeat(long ? 3 : 1)} />
    </svg>
  );
}
