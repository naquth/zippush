"use client"
import { useEffect, useRef } from "react"
import type { LogType } from "@/lib/zippush/types"

export interface LogLine { id: number; type: LogType; msg: string; t: string }

// Konsol selalu gelap (seperti terminal) di kedua tema.
const COLOR: Record<LogType, string> = { ok: "#3ddc97", err: "#ff5470", warn: "#ffc24b", info: "#6cb8ff", plain: "#8f8b84" }
const MARK: Record<LogType, string> = { ok: "✓", err: "✗", warn: "!", info: "›", plain: " " }

export function RunConsole({ logs }: { logs: LogLine[] }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { ref.current?.scrollTo({ top: ref.current.scrollHeight }) }, [logs.length])
  return (
    <div ref={ref} aria-live="polite" className="scroll-thin max-h-64 overflow-y-auto rounded-2xl border border-white/5 bg-[#0c0c0f] p-3.5 font-mono text-[12px] leading-relaxed text-[#cfcac1]">
      {logs.map((l) => (
        <div key={l.id} className="flex gap-2" style={{ color: COLOR[l.type] }}>
          <span className="w-4 shrink-0 text-center opacity-80">{MARK[l.type]}</span>
          <span className="shrink-0 opacity-40">{l.t}</span>
          <span className="min-w-0 break-words">{l.msg}</span>
        </div>
      ))}
      {logs.length === 0 && <div className="text-[#8f8b84]">Menunggu…</div>}
    </div>
  )
}
