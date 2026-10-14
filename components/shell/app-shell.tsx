"use client"

import { useCallback, useEffect, useState, type ReactNode } from "react"
import { CloudUpload, FolderTree, GitBranch, SlidersHorizontal, type LucideIcon } from "lucide-react"
import { Logo } from "@/components/brand/logo"
import { ThemeToggle } from "@/components/theme-toggle"
import { Guide } from "@/components/shell/guide"
import { ShellContext, type ViewId } from "@/components/shell/shell-context"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useGithub } from "@/lib/github-context"
import { cn } from "@/lib/utils"

const NAV: Array<{ id: ViewId; label: string; hint: string; icon: LucideIcon }> = [
  { id: "upload", label: "Unggah", hint: "Kirim file ke repo", icon: CloudUpload },
  { id: "explorer", label: "Penjelajah", hint: "Telusuri & hapus", icon: FolderTree },
  { id: "repositories", label: "Repositori", hint: "Pilih & kelola", icon: GitBranch },
  { id: "settings", label: "Pengaturan", hint: "Token & preferensi", icon: SlidersHorizontal },
]
const IDS = NAV.map((n) => n.id)

function ConnectionCard({ onConnect }: { onConnect: () => void }) {
  const { config, user, userError, owner, isConfigured } = useGithub()
  if (!config.token) {
    return (
      <button onClick={onConnect} className="w-full rounded-2xl border border-dashed border-brand bg-primary/5 p-3 text-left transition hover:bg-primary/10">
        <p className="flex items-center gap-2 text-sm font-bold"><span className="h-2 w-2 rounded-full bg-warn" /> Belum terhubung</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Ketuk untuk menambahkan token GitHub.</p>
      </button>
    )
  }
  if (userError) {
    return (
      <button onClick={onConnect} className="w-full rounded-2xl border border-destructive/50 bg-destructive/10 p-3 text-left">
        <p className="flex items-center gap-2 text-sm font-bold"><span className="h-2 w-2 rounded-full bg-destructive" /> Token bermasalah</p>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{userError}</p>
      </button>
    )
  }
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-secondary/50 p-3">
      <Avatar className="h-10 w-10 ring-2 ring-primary/60">
        <AvatarImage src={user?.avatar_url} alt={user?.login ?? ""} />
        <AvatarFallback>{(user?.login ?? "?").slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold">@{user?.login ?? "…"}</p>
        <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", isConfigured ? "bg-success" : "bg-warn")} />
          {isConfigured ? `${owner}/${config.repo}` : "pilih repositori"}
        </p>
      </div>
    </div>
  )
}

export function AppShell({ views }: { views: Record<ViewId, ReactNode> }) {
  const { config } = useGithub()
  const [view, setViewState] = useState<ViewId>("upload")

  const setView = useCallback((v: ViewId) => {
    setViewState(v)
    history.replaceState(null, "", `#${v}`)
    window.scrollTo({ top: 0 })
  }, [])

  // deep-link: #settings dst.
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.slice(1) as ViewId
      if (IDS.includes(h)) setViewState(h)
    }
    read()
    window.addEventListener("hashchange", read)
    return () => window.removeEventListener("hashchange", read)
  }, [])

  return (
    <ShellContext.Provider value={{ view, setView }}>
      <div className="brand-aura relative min-h-dvh">
        {/* ───── rail desktop ───── */}
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-[272px] flex-col border-r bg-card/70 p-5 backdrop-blur-xl lg:flex">
          <div className="px-1 pt-1"><Logo height={30} /></div>
          <nav role="tablist" aria-orientation="vertical" aria-label="Menu utama" className="mt-9 flex flex-col gap-1.5">
            {NAV.map(({ id, label, hint, icon: Icon }) => {
              const on = view === id
              return (
                <button
                  key={id} role="tab" id={`rail-${id}`} aria-label={label} aria-selected={on} aria-controls={`panel-${id}`}
                  onClick={() => setView(id)}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-2xl px-3.5 py-3 text-left transition-colors",
                    on ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                  )}
                >
                  {on && <span className="absolute -left-5 top-3 bottom-3 w-1 rounded-r-full bg-brand" />}
                  <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors", on ? "bg-brand text-primary-foreground shadow-glow" : "bg-secondary")}>
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold">{label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{hint}</span>
                  </span>
                </button>
              )
            })}
          </nav>
          <div className="mt-auto space-y-3">
            <ConnectionCard onConnect={() => setView("settings")} />
            <div className="flex items-center justify-between px-1">
              <p className="text-xs text-muted-foreground">© Naquth</p>
              <div className="flex"><Guide /><ThemeToggle /></div>
            </div>
          </div>
        </aside>

        {/* ───── top bar mobile ───── */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/80 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl lg:hidden" style={{ boxSizing: "content-box" }}>
          <Logo height={22} />
          <div className="flex items-center gap-0.5"><Guide /><ThemeToggle /></div>
        </header>

        {/* ───── konten ───── */}
        <main className="lg:pl-[272px]">
          <div className="mx-auto max-w-3xl px-4 py-6 pb-32 sm:px-6 lg:py-10 lg:pb-14">
            {config.token && <div className="mb-5 lg:hidden"><ConnectionCard onConnect={() => setView("settings")} /></div>}
            {NAV.map(({ id }) => (
              <section key={id} id={`panel-${id}`} role="tabpanel" aria-labelledby={`rail-${id}`} hidden={view !== id} className={view === id ? "animate-rise" : undefined}>
                {views[id]}
              </section>
            ))}
          </div>
        </main>

        {/* ───── bottom bar mobile ───── */}
        <nav role="tablist" aria-label="Menu utama" className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur-xl lg:hidden">
          <div className="mx-auto grid max-w-md grid-cols-4 gap-1 px-2 py-1.5">
            {NAV.map(({ id, label, icon: Icon }) => {
              const on = view === id
              return (
                <button
                  key={id} role="tab" aria-label={label} aria-selected={on} aria-controls={`panel-${id}`}
                  onClick={() => setView(id)}
                  className={cn("flex flex-col items-center gap-1 rounded-2xl py-1.5 text-[11px] font-bold transition-colors", on ? "text-foreground" : "text-muted-foreground")}
                >
                  <span className={cn("grid h-8 w-14 place-items-center rounded-full transition-all", on ? "bg-brand text-primary-foreground shadow-glow" : "")}>
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  {label}
                </button>
              )
            })}
          </div>
        </nav>
      </div>
    </ShellContext.Provider>
  )
}
