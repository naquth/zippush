"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Lock, Globe, Star, GitFork, Trash2, Check, Plus, RefreshCw, Search, KeyRound } from "lucide-react"
import { useGithub } from "@/lib/github-context"
import { useShell } from "@/components/shell/shell-context"
import { ViewHeader } from "@/components/shell/view-header"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import type { GitHubRepo } from "@/lib/zippush/github"
import { cn } from "@/lib/utils"

const NAME_RE = /^[A-Za-z0-9._-]{1,100}$/

export function Repositories() {
  const { config, setConfig, repositories, reposLoading, refreshRepositories, client, owner } = useGithub()
  const { setView } = useShell()
  const [search, setSearch] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const [toDelete, setToDelete] = useState<GitHubRepo | null>(null)
  const [confirmName, setConfirmName] = useState("")
  const [name, setName] = useState("")
  const [desc, setDesc] = useState("")
  const [isPrivate, setIsPrivate] = useState(true)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const selectRepo = (r: GitHubRepo) => {
    void setConfig({ ...config, username: r.owner.login, repo: r.name, branch: r.default_branch || "main" })
    toast.success(`Target: ${r.full_name}`)
  }

  const handleCreate = async () => {
    if (!NAME_RE.test(name)) return toast.error("Nama repo hanya boleh huruf, angka, titik, strip, dan underscore.")
    setCreating(true)
    try {
      const r = await client.createRepo(name, desc, isPrivate)
      toast.success("Repositori berhasil dibuat dan dijadikan target.")
      setCreateOpen(false); setName(""); setDesc("")
      selectRepo(r)
      refreshRepositories()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal membuat repositori")
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async () => {
    if (!toDelete || confirmName !== toDelete.name) return
    setDeleting(true)
    try {
      await client.deleteRepo(toDelete.owner.login, toDelete.name)
      toast.success(`Repositori ${toDelete.full_name} dihapus.`)
      if (config.repo === toDelete.name && owner === toDelete.owner.login) void setConfig({ ...config, repo: "" })
      setToDelete(null); setConfirmName("")
      refreshRepositories()
    } catch (e) {
      const m = e instanceof Error ? e.message : ""
      toast.error(/403|404/.test(m) ? "Gagal menghapus. Token harus punya scope 'delete_repo' dan hak admin." : m || "Gagal menghapus repositori")
    } finally {
      setDeleting(false)
    }
  }

  const filtered = repositories.filter((r) => r.full_name.toLowerCase().includes(search.toLowerCase()))

  if (!config.token) {
    return (
      <div>
        <ViewHeader eyebrow="Kelola" title="Repositori" subtitle="Lihat, pilih, buat, dan hapus repositori." />
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-secondary"><KeyRound className="h-6 w-6 text-muted-foreground" /></span>
            <p className="max-w-xs text-sm text-muted-foreground">Masukkan token di tab Pengaturan untuk mengelola repositori.</p>
            <Button size="sm" onClick={() => setView("settings")}>Buka Pengaturan</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <ViewHeader
        eyebrow="Kelola"
        title="Repositori"
        subtitle={`${reposLoading ? "Memuat…" : `${repositories.length} repositori (publik & privat).`} Ketuk satu untuk dijadikan target unggahan.`}
        right={
          <div className="flex gap-2">
            <Button variant="secondary" size="icon" onClick={refreshRepositories} disabled={reposLoading} aria-label="Segarkan daftar"><RefreshCw className={cn("h-4 w-4", reposLoading && "animate-spin")} /></Button>
            <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Buat Repositori</Button>
          </div>
        }
      />
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Cari repositori…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {filtered.map((r) => {
          const active = r.name === config.repo && r.owner.login === owner
          return (
            <Card key={r.id} className={cn("flex flex-col transition-all", active && "border-brand shadow-glow")}>
              <CardContent className="flex flex-1 flex-col gap-3 pt-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-muted-foreground">{r.owner.login}</p>
                    <a href={r.html_url} target="_blank" rel="noreferrer noopener" className="block truncate font-display text-base font-bold hover:underline">{r.name}</a>
                  </div>
                  <span className={cn("flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold", r.private ? "text-warn" : "text-muted-foreground")}>
                    {r.private ? <><Lock className="h-3 w-3" /> Privat</> : <><Globe className="h-3 w-3" /> Publik</>}
                  </span>
                </div>
                <p className="line-clamp-2 min-h-[2.5rem] text-sm text-muted-foreground">{r.description || "Tidak ada deskripsi."}</p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {r.language && <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand" />{r.language}</span>}
                  <span className="flex items-center gap-1"><Star className="h-3 w-3" /> {r.stargazers_count}</span>
                  <span className="flex items-center gap-1"><GitFork className="h-3 w-3" /> {r.forks_count}</span>
                </div>
                <div className="mt-auto flex gap-2 pt-1">
                  <Button size="sm" variant={active ? "secondary" : "default"} className="flex-1" onClick={() => selectRepo(r)} disabled={active}>
                    {active ? <><Check className="h-4 w-4" /> Target aktif</> : "Jadikan target"}
                  </Button>
                  {r.permissions?.admin && (
                    <Button size="icon" variant="ghost" className="h-9 w-9 text-destructive hover:bg-destructive/10 hover:text-destructive" aria-label={`Hapus ${r.name}`} onClick={() => { setToDelete(r); setConfirmName("") }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
      {!reposLoading && filtered.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">Tidak ada repositori yang cocok.</p>}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Buat repositori baru</DialogTitle><DialogDescription>Akan dibuat dengan README awal, lalu dijadikan target.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label htmlFor="rn">Nama repositori *</Label><Input id="rn" value={name} onChange={(e) => setName(e.target.value)} placeholder="my-awesome-project" autoComplete="off" /></div>
            <div className="space-y-2"><Label htmlFor="rd">Deskripsi</Label><Input id="rd" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Deskripsi singkat" /></div>
            <div className="flex items-center justify-between gap-3 rounded-2xl border bg-secondary/40 p-3.5">
              <div className="space-y-0.5">
                <Label className="flex items-center gap-2 text-sm">{isPrivate ? <Lock className="h-4 w-4" /> : <Globe className="h-4 w-4" />} Repositori Privat</Label>
                <p className="text-xs text-muted-foreground">{isPrivate ? "Hanya Anda dan kolaborator yang bisa melihat." : "Siapa pun di internet bisa melihat."}</p>
              </div>
              <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
            </div>
            <Button className="w-full" onClick={handleCreate} disabled={creating || !name}>{creating ? "Membuat…" : "Buat Repositori"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!toDelete} onOpenChange={(o) => !o && !deleting && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus repositori</DialogTitle>
            <DialogDescription>
              Tindakan ini <b>permanen</b> dan menghapus seluruh kode, issue, dan riwayat. Token harus punya scope <code>delete_repo</code>. Ketik <b className="text-foreground">{toDelete?.name}</b> untuk mengonfirmasi.
            </DialogDescription>
          </DialogHeader>
          <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={toDelete?.name} autoComplete="off" spellCheck={false} />
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setToDelete(null)} disabled={deleting}>Batal</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting || confirmName !== toDelete?.name}>{deleting ? "Menghapus…" : "Hapus permanen"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
