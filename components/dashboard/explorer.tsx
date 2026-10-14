"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { toast } from "sonner"
import { RefreshCw, Trash2, ChevronRight, Download, Search, FolderTree, Home } from "lucide-react"
import { useGithub } from "@/lib/github-context"
import { useShell } from "@/components/shell/shell-context"
import { ViewHeader } from "@/components/shell/view-header"
import { FileGlyph } from "@/components/dashboard/file-glyph"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { GitHubError, type ContentItem } from "@/lib/zippush/github"
import { runDelete } from "@/lib/zippush/engine"

const fmt = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b > 1024 ? `${(b / 1024).toFixed(1)} KB` : `${b} B`)

export function Explorer() {
  const { config, isConfigured, client, contentsVersion, owner } = useGithub()
  const { setView } = useShell()
  const [items, setItems] = useState<ContentItem[]>([])
  const [path, setPath] = useState("")
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [notice, setNotice] = useState("")
  const [target, setTarget] = useState<ContentItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const reqId = useRef(0)
  const branch = config.branch.trim()

  const load = useCallback(async (p: string) => {
    if (!isConfigured) return
    const id = ++reqId.current
    setLoading(true)
    try {
      const data = await client.listContents(p, branch)
      if (id !== reqId.current) return // respons basi (user sudah pindah folder)
      data.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1))
      setItems(data); setPath(p); setNotice("")
    } catch (e) {
      if (id !== reqId.current) return
      if (e instanceof GitHubError && e.status === 404) { setItems([]); setPath(p); setNotice(e.message) }
      else toast.error(e instanceof Error ? e.message : "Gagal mengambil file")
    } finally {
      if (id === reqId.current) setLoading(false)
    }
  }, [client, branch, isConfigured])

  // root dimuat ulang saat repo/branch berganti atau isi repo berubah (unggahan baru)
  useEffect(() => { setSearch(""); load("") }, [load, contentsVersion])

  const confirmDelete = async () => {
    if (!target) return
    setDeleting(true)
    try {
      const res = await runDelete(client, { branch, paths: [target.path], message: `Hapus ${target.path}` }, { log: () => {}, progress: () => {} })
      toast.success(`Dihapus ${res.deleted} file dalam 1 commit`)
      setTarget(null)
      load(path)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus")
    } finally {
      setDeleting(false)
    }
  }

  const filtered = items.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
  const crumbs = path.split("/").filter(Boolean)

  const header = (
    <ViewHeader
      eyebrow="Jelajah"
      title="Penjelajah"
      subtitle={isConfigured ? `${owner}/${config.repo} · ${branch}` : "Telusuri dan hapus file langsung di repositori."}
      right={isConfigured && <Button variant="secondary" size="sm" onClick={() => load(path)} disabled={loading} aria-label="Muat ulang"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Segarkan</Button>}
    />
  )

  if (!isConfigured) {
    return (
      <div>
        {header}
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-secondary"><FolderTree className="h-6 w-6 text-muted-foreground" /></span>
            <p className="max-w-xs text-sm text-muted-foreground">Lengkapi pengaturan GitHub untuk menjelajahi file.</p>
            <Button size="sm" onClick={() => setView("settings")}>Buka Pengaturan</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div>
      {header}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <nav className="scroll-thin flex min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-2xl border bg-card px-2 py-1.5 text-sm" aria-label="Lokasi">
            <button className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 font-bold hover:bg-accent" onClick={() => load("")}><Home className="h-3.5 w-3.5" /> {config.repo}</button>
            {crumbs.map((c, i) => (
              <span key={i} className="flex shrink-0 items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                <button className="rounded-lg px-2 py-1 font-semibold hover:bg-accent" onClick={() => load(crumbs.slice(0, i + 1).join("/"))}>{c}</button>
              </span>
            ))}
          </nav>
          <div className="relative sm:w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Cari file…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>

        <Card className="overflow-hidden p-1.5">
          {loading && items.length === 0 ? (
            <div className="space-y-1.5 p-1.5">{[0, 1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded-2xl bg-secondary/60" />)}</div>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">{notice || "Tidak ada file ditemukan"}</p>
          ) : (
            filtered.map((f) => (
              <div key={f.sha + f.path} className="group flex items-center gap-3 rounded-2xl px-2.5 py-2 transition-colors hover:bg-accent/70">
                <FileGlyph name={f.name} dir={f.type === "dir"} />
                <div className="min-w-0 flex-1">
                  {f.type === "dir" ? (
                    <button onClick={() => load(f.path)} className="block max-w-full truncate text-left text-sm font-bold hover:underline">{f.name}</button>
                  ) : (
                    <a href={f.html_url} target="_blank" rel="noreferrer noopener" className="block truncate text-sm font-semibold hover:underline">{f.name}</a>
                  )}
                  <p className="text-xs text-muted-foreground">{f.type === "dir" ? "Folder" : fmt(f.size)}</p>
                </div>
                <div className="flex shrink-0 items-center lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100 lg:focus-within:opacity-100">
                  {f.type === "file" && f.download_url && (
                    <Button asChild variant="ghost" size="icon" className="h-9 w-9" aria-label="Unduh">
                      <a href={f.download_url} target="_blank" rel="noreferrer noopener"><Download className="h-4 w-4" /></a>
                    </Button>
                  )}
                  {(f.type === "file" || f.type === "dir") && (
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:bg-destructive/10 hover:text-destructive" aria-label={`Hapus ${f.name}`} onClick={() => setTarget(f)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </Card>
      </div>

      <Dialog open={!!target} onOpenChange={(o) => !o && !deleting && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus {target?.type === "dir" ? "folder" : "file"}?</DialogTitle>
            <DialogDescription>
              <code className="font-mono">{target?.path}</code> akan dihapus dari branch <b>{branch}</b>
              {target?.type === "dir" ? " beserta seluruh isinya" : ""} dalam satu commit. Versi lama tetap ada di riwayat git.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setTarget(null)} disabled={deleting}>Batal</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>{deleting ? "Menghapus…" : "Hapus"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
