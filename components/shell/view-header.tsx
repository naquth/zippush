import type { ReactNode } from "react"

export function ViewHeader({ eyebrow, title, subtitle, right }: { eyebrow?: string; title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-brand">{eyebrow}</p>}
        <h1 className="font-display text-2xl font-bold sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  )
}

/** Label kecil kapital untuk judul seksi di dalam kartu. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{children}</p>
}
