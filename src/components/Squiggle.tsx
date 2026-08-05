// Маленький росчерк воды под надстрочником и заголовками — как в макетах.
// Вместо жирной линии-разделителя: тот же приём, что на главной в блоке шагов.
export function Squiggle({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 64 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={`h-2.5 w-16 text-primary/50 ${className}`}
    >
      <path d="M2 6c4-5 8-5 12 0s8 5 12 0 8-5 12 0 8 5 12 0" />
    </svg>
  );
}
