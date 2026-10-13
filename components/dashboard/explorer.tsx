"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { toast } from "sonner"
import { Folder, File, RefreshCw, Trash2, ChevronRight, Download } from "lucide-react"
import { useGithub } from "@/lib/github-context"
import { Card, CardHeader, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { GitHubError, type ContentItem } from "@/lib/zippush/github"
import { runDelete } from "@/lib/zippush/engine"

const fmt = (b: number) => (b > 1024 ? `${(b / 1024).toFixed(1)} KB` : `${b} B`)

export function Explorer() {
  const { config, isConfigured, client, contentsVersion } = useGithub()
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
      const res = await runDelete(
        client,
        { branch, paths: [target.path], message: `Hapus ${target.path}` },
        { log: () => {}, progress: () => {} }
      )
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

  if (!isConfigured) {
    return (
      <Card className="bg-destructive/10 border-destructive mt-6 max-w-5xl mx-auto">
        <CardContent className="p-4 text-center text-sm">Lengkapi pengaturan GitHub untuk menjelajahi file.</CardContent>
      </Card>
    )
  }

  return (
    <Card className="mt-6 max-w-5xl mx-auto">
      <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between py-4 gap-3">
        <nav className="flex items-center flex-wrap gap-1 text-sm font-mono min-w-0" aria-label="Lokasi">
          <button className="hover:underline font-semibold" onClick={() => load("")}>{config.repo}</button>
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              <button className="hover:underline" onClick={() => load(crumbs.slice(0, i + 1).join("/"))}>{c}</button>
            </span>
          ))}
          <Button variant="ghost" size="icon" className="h-7 w-7 ml-1" onClick={() => load(path)} disabled={loading} aria-label="Muat ulang">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </nav>
        <Input placeholder="Cari file…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full sm:w-56" />
      </CardHeader>
      <CardContent className="p-0">
        <div className="border-t overflow-x-auto">
          <table className="w-full text-sm text-left">
            <tbody className="divide-y">
              {loading && items.length === 0 ? (
                <tr><td className="px-4 py-8 text-center text-muted-foreground">Memuat…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td className="px-4 py-8 text-center text-muted-foreground">{notice || "Tidak ada file ditemukan"}</td></tr>
              ) : (
                filtered.map((f) => (
                  <tr key={f.sha + f.path} className="hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        {f.type === "dir" ? <Folder className="h-4 w-4 text-sky-500 shrink-0" /> : <File className="h-4 w-4 text-muted-foreground shrink-0" />}
                        {f.type === "dir" ? (
                          <button onClick={() => load(f.path)} className="font-medium hover:underline text-left truncate">{f.name}</button>
                        ) : (
                          <a href={f.html_url} target="_blank" rel="noreferrer noopener" className="hover:underline truncate">{f.name}</a>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-muted-foreground whitespace-nowrap text-right">{f.type === "file" ? fmt(f.size) : "—"}</td>
                    <td className="px-2 py-2.5 text-right whitespace-nowrap">
                      {f.type === "file" && f.download_url && (
                        <Button asChild variant="ghost" size="icon" className="h-8 w-8" aria-label="Unduh">
                          <a href={f.download_url} target="_blank" rel="noreferrer noopener"><Download className="h-4 w-4" /></a>
                        </Button>
                      )}
                      {(f.type === "file" || f.type === "dir") && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive" aria-label={`Hapus ${f.name}`} onClick={() => setTarget(f)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>

      <Dialog open={!!target} onOpenChange={(o) => !o && !deleting && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus {target?.type === "dir" ? "folder" : "file"}?</DialogTitle>
            <DialogDescription>
              <code className="font-mono">{target?.path}</code> akan dihapus dari branch <b>{branch}</b>
              {target?.type === "dir" ? " beserta seluruh isinya" : ""} dalam satu commit. Versi lama tetap ada di riwayat git.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setTarget(null)} disabled={deleting}>Batal</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>{deleting ? "Menghapus…" : "Hapus"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
