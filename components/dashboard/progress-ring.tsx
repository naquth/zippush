import { cn } from "@/lib/utils"

/** Cincin progres bergradien api. */
export function ProgressRing({ value, size = 88, stroke = 8, className }: { value: number; size?: number; stroke?: number; className?: string }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.min(100, Math.max(0, value))
  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="ring-ember" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" style={{ stopColor: "var(--ember-from)" }} />
            <stop offset="100%" style={{ stopColor: "var(--ember-to)" }} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} style={{ stroke: "var(--secondary)" }} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          stroke="url(#ring-ember)" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)}
          className="transition-[stroke-dashoffset] duration-300"
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center"><span className="flex items-baseline font-display text-lg font-bold tabular-nums">{Math.round(v)}<span className="ml-0.5 text-xs font-semibold text-muted-foreground">%</span></span></span>
    </div>
  )
}
