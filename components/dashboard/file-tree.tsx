"use client"
import { useMemo, useState } from "react"
import { ChevronRight, Folder, X, File as FileIcon, FileCode, FileImage, FileText, FileArchive } from "lucide-react"
import { cn } from "@/lib/utils"

export interface TreeFile { id: string; path: string; size: number }

const fmt = (b: number) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`)
const clean = (p: string) => p.replace(/\\/g, "/").replace(/^(\.\/|\/)+/, "")

function iconFor(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? ""
  if (["ts", "tsx", "js", "jsx", "mjs", "css", "html", "json", "py", "go", "rs", "sh", "yml", "yaml"].includes(ext)) return <FileCode className="h-4 w-4 text-info" />
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "avif"].includes(ext)) return <FileImage className="h-4 w-4 text-success" />
  if (["md", "txt", "csv", "log"].includes(ext)) return <FileText className="h-4 w-4 text-muted-foreground" />
  if (["zip", "gz", "tar", "rar", "7z"].includes(ext)) return <FileArchive className="h-4 w-4 text-warn" />
  return <FileIcon className="h-4 w-4 text-muted-foreground" />
}

const PER_GROUP = 40

/** Antrean sebagai pohon per-folder teratas (bukan daftar datar). */
export function FileTree({ files, onRemove, disabled }: { files: TreeFile[]; onRemove: (ids: string[]) => void; disabled?: boolean }) {
  const groups = useMemo(() => {
    const m = new Map<string, TreeFile[]>()
    for (const f of files) {
      const p = clean(f.path)
      const i = p.indexOf("/")
      const key = i === -1 ? "" : p.slice(0, i)
      const arr = m.get(key) ?? []
      arr.push({ ...f, path: i === -1 ? p : p.slice(i + 1) })
      m.set(key, arr)
    }
    return [...m.entries()].sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)))
  }, [files])

  const [closed, setClosed] = useState<Set<string>>(() => new Set())
  const defaultClosed = files.length > 80
  const isOpen = (k: string) => (closed.has(k) ? false : closed.has("+" + k) ? true : !defaultClosed)
  const toggle = (k: string) =>
    setClosed((s) => {
      const n = new Set(s); const open = isOpen(k)
      n.delete(k); n.delete("+" + k); n.add(open ? k : "+" + k)
      return n
    })

  const row = (f: TreeFile, indent: boolean) => (
    <div key={f.id} className={cn("group flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 hover:bg-accent/70", indent && "ml-5")}>
      {iconFor(f.path)}
      <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{f.path}</span>
      {f.size > 0 && <span className="shrink-0 text-xs text-muted-foreground">{fmt(f.size)}</span>}
      <button
        type="button" disabled={disabled} aria-label={`Hapus ${f.path} dari antrean`} onClick={() => onRemove([f.id])}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted-foreground opacity-60 transition hover:bg-destructive/15 hover:text-destructive hover:opacity-100 disabled:pointer-events-none"
      ><X className="h-3.5 w-3.5" /></button>
    </div>
  )

  return (
    <div className="scroll-thin max-h-72 overflow-y-auto rounded-2xl border bg-background/50 p-1.5">
      {groups.map(([key, list]) => {
        if (key === "") return <div key="root">{list.slice(0, PER_GROUP).map((f) => row(f, false))}{list.length > PER_GROUP && <p className="px-3 py-1.5 text-xs text-muted-foreground">…dan {list.length - PER_GROUP} berkas lain di root</p>}</div>
        const open = isOpen(key)
        const size = list.reduce((s, f) => s + f.size, 0)
        return (
          <div key={key}>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => toggle(key)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2.5 py-2 text-left hover:bg-accent/70">
                <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
                <Folder className="h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 truncate text-sm font-bold">{key}/</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">{list.length} file{size > 0 ? ` · ${fmt(size)}` : ""}</span>
              </button>
              <button type="button" disabled={disabled} aria-label={`Hapus folder ${key} dari antrean`} onClick={() => onRemove(list.map((f) => f.id))}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted-foreground opacity-60 transition hover:bg-destructive/15 hover:text-destructive hover:opacity-100 disabled:pointer-events-none"><X className="h-3.5 w-3.5" /></button>
            </div>
            {open && (
              <div className="border-l border-dashed border-border ml-[18px]">
                {list.slice(0, PER_GROUP).map((f) => row(f, false))}
                {list.length > PER_GROUP && <p className="px-3 py-1.5 text-xs text-muted-foreground">…dan {list.length - PER_GROUP} berkas lain</p>}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
