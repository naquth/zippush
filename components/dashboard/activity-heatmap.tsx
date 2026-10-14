"use client"
import { useEffect, useMemo, useRef } from "react"
import { useGithub } from "@/lib/github-context"
import { Card, CardContent } from "@/components/ui/card"
import { Eyebrow } from "@/components/shell/view-header"

const WEEKS = 36
const iso = (d: Date) => d.toISOString().split("T")[0] // sama dengan format yang dicatat recordUploads
const level = (n: number, max: number) => (n <= 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)))
const bg = (l: number): React.CSSProperties =>
  l === 0 ? { background: "var(--secondary)" }
  : l === 4 ? { backgroundImage: "linear-gradient(135deg, var(--ember-from), var(--ember-to))" }
  : { background: `color-mix(in srgb, var(--ember-from) ${[28, 52, 76][l - 1]}%, transparent)` }

/** Peta aktivitas ala kalender: 20 minggu terakhir. Menggantikan grafik batang. */
export function ActivityHeatmap() {
  const { uploadHistory } = useGithub()
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => { scroller.current?.scrollTo({ left: scroller.current.scrollWidth }) }, [])
  const { cells, total, days, max } = useMemo(() => {
    const today = new Date()
    const dow = today.getUTCDay()
    const count = (WEEKS - 1) * 7 + dow + 1
    const out: { date: string; n: number }[] = []
    let total = 0, days = 0, max = 0
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i))
      const date = iso(d); const n = uploadHistory[date] ?? 0
      out.push({ date, n }); total += n; if (n) days++; if (n > max) max = n
    }
    return { cells: out, total, days, max: Math.max(max, 1) }
  }, [uploadHistory])

  return (
    <Card>
      <CardContent className="space-y-4 pt-5 sm:pt-6">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div><Eyebrow>Jejak unggahan</Eyebrow><p className="mt-1 font-display text-xl font-bold">{total} <span className="text-sm font-medium text-muted-foreground">berkas · {days} hari aktif</span></p></div>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground" aria-hidden>
            Sedikit {[0, 1, 2, 3, 4].map((l) => <span key={l} className="h-3 w-3 rounded-[4px]" style={bg(l)} />)} Banyak
          </div>
        </div>
        <div ref={scroller} className="scroll-thin overflow-x-auto pb-1">
          <div className="grid w-max grid-flow-col grid-rows-7 gap-[3px]" role="img" aria-label={`${total} berkas diunggah dalam ${WEEKS} minggu terakhir`}>
            {cells.map((c) => (
              <span key={c.date} title={`${c.date}: ${c.n} berkas`} className="h-3.5 w-3.5 rounded-[4px] transition-transform hover:scale-125" style={bg(level(c.n, max))} />
            ))}
          </div>
        </div>
        {total === 0 && <p className="text-xs text-muted-foreground">Belum ada unggahan. Setiap file yang berhasil dikirim akan menyalakan satu kotak.</p>}
      </CardContent>
    </Card>
  )
}
