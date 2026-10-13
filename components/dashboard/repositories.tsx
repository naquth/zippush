"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Lock, Globe, Star, GitFork, BookMarked, Trash2, Check } from "lucide-react"
import { useGithub } from "@/lib/github-context"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import type { GitHubRepo } from "@/lib/zippush/github"

const NAME_RE = /^[A-Za-z0-9._-]{1,100}$/

export function Repositories() {
  const { config, setConfig, repositories, reposLoading, refreshRepositories, client, owner } = useGithub()
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
      <Card className="bg-destructive/10 border-destructive mt-6 max-w-5xl mx-auto">
        <CardContent className="p-4 text-center text-sm">Masukkan token di tab Pengaturan untuk mengelola repositori.</CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6 mt-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Repositori</h2>
          <p className="text-muted-foreground text-sm">{reposLoading ? "Memuat…" : `${repositories.length} repositori (publik & privat).`} Ketuk satu untuk dijadikan target unggahan.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Input placeholder="Cari repositori…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full sm:w-64" />
          <Button className="w-full sm:w-auto" onClick={() => setCreateOpen(true)}>Buat Repositori</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((r) => {
          const active = r.name === config.repo && r.owner.login === owner
          return (
            <Card key={r.id} className={`flex flex-col ${active ? "border-primary ring-1 ring-primary" : ""}`}>
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start gap-2">
                  <CardTitle className="text-base font-bold flex items-center gap-2 min-w-0 flex-1">
                    <BookMarked className="h-4 w-4 text-muted-foreground shrink-0" />
                    <a href={r.html_url} target="_blank" rel="noreferrer noopener" className="hover:underline truncate">{r.full_name}</a>
                  </CardTitle>
                  <span className="text-xs border px-2 py-0.5 rounded-full text-muted-foreground flex items-center gap-1 shrink-0">
                    {r.private ? <><Lock className="h-3 w-3" /> Privat</> : <><Globe className="h-3 w-3" /> Publik</>}
                  </span>
                </div>
                <CardDescription className="line-clamp-2 h-10 mt-2">{r.description || "Tidak ada deskripsi."}</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto pt-0 space-y-3">
                <div className="flex gap-4 text-sm text-muted-foreground">
                  {r.language && <span>{r.language}</span>}
                  <span className="flex items-center gap-1"><Star className="h-3 w-3" /> {r.stargazers_count}</span>
                  <span className="flex items-center gap-1"><GitFork className="h-3 w-3" /> {r.forks_count}</span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant={active ? "secondary" : "default"} className="flex-1" onClick={() => selectRepo(r)} disabled={active}>
                    {active ? <><Check className="h-4 w-4 mr-1" /> Target aktif</> : "Jadikan target"}
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
      {!reposLoading && filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">Tidak ada repositori yang cocok.</div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Buat repositori baru</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label htmlFor="rn">Nama repositori *</Label><Input id="rn" value={name} onChange={(e) => setName(e.target.value)} placeholder="my-awesome-project" autoComplete="off" /></div>
            <div className="space-y-2"><Label htmlFor="rd">Deskripsi</Label><Input id="rd" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Deskripsi singkat" /></div>
            <div className="flex items-center justify-between border p-4 rounded-lg gap-3">
              <div className="space-y-0.5">
                <Label className="text-base flex items-center gap-2">{isPrivate ? <Lock className="h-4 w-4" /> : <Globe className="h-4 w-4" />} Repositori Privat</Label>
                <p className="text-sm text-muted-foreground">{isPrivate ? "Hanya Anda dan kolaborator yang bisa melihat." : "Siapa pun di internet bisa melihat."}</p>
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
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setToDelete(null)} disabled={deleting}>Batal</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting || confirmName !== toDelete?.name}>{deleting ? "Menghapus…" : "Hapus permanen"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
