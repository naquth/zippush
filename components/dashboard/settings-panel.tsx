"use client"

import { useState, useRef, useEffect } from "react"
import { toast } from "sonner"
import { Download, Upload, Trash, Save, CheckCircle2, XCircle, Eye, EyeOff, ShieldAlert, ExternalLink } from "lucide-react"
import { useGithub, defaultConfig, type GitHubConfig } from "@/lib/github-context"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { normalizeFolder } from "@/lib/zippush/paths"

const TOKEN_URL = "https://github.com/settings/tokens/new?scopes=repo,workflow&description=Naquth"

export function SettingsPanel() {
  const { config, setConfig, clearAll, user, scopes, userError, owner, repositories, branches, refreshUser } = useGithub()
  const [form, setForm] = useState<GitHubConfig>(config)
  const [showToken, setShowToken] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => setForm(config), [config])
  const patch = (p: Partial<GitHubConfig>) => setForm((f) => ({ ...f, ...p }))

  const handleSave = async () => {
    try { normalizeFolder(form.targetFolder) } catch (e) { return toast.error((e as Error).message) }
    await setConfig({ ...form, token: form.token.trim(), username: form.username.trim(), repo: form.repo.trim(), branch: form.branch.trim() || "main" })
    toast.success("Pengaturan disimpan")
  }

  const handleClear = async () => {
    await clearAll()
    toast.info("Sesi dan data lokal dihapus")
  }

  const exportConfig = () => {
    // token SENGAJA tidak diekspor
    const { token: _t, rememberToken: _r, ...safe } = form
    void _t; void _r
    const url = URL.createObjectURL(new Blob([JSON.stringify(safe, null, 2)], { type: "application/json" }))
    const a = document.createElement("a")
    a.href = url; a.download = "naquth-config.json"; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const importConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const d = JSON.parse(String(reader.result)) as Record<string, unknown>
        const s = (v: unknown, fb: string) => (typeof v === "string" ? v : fb)
        patch({
          username: s(d.username, ""), repo: s(d.repo, ""), branch: s(d.branch, "main"),
          targetFolder: s(d.targetFolder, ""), commitMessageTemplate: s(d.commitMessageTemplate, defaultConfig.commitMessageTemplate),
        })
        toast.success("Konfigurasi diimpor (token tidak ikut). Tekan Simpan.")
      } catch {
        toast.error("File konfigurasi tidak valid")
      }
    }
    reader.readAsText(file)
  }

  const selectedFull = form.repo ? `${form.username || owner}/${form.repo}` : ""
  const onPickRepo = (full: string) => {
    const r = repositories.find((x) => x.full_name === full)
    if (r) patch({ username: r.owner.login, repo: r.name, branch: r.default_branch || "main" })
  }
  const hasRepoScope = scopes === null || scopes.includes("repo")

  return (
    <div className="space-y-6 max-w-4xl mx-auto mt-6">
      <Card>
        <CardHeader>
          <CardTitle>Konfigurasi</CardTitle>
          <CardDescription>Hubungkan akun GitHub dan pilih repositori target.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="token">Personal Access Token</Label>
              <a href={TOKEN_URL} target="_blank" rel="noreferrer noopener" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                Buat token <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="relative">
              <Input id="token" type={showToken ? "text" : "password"} value={form.token} onChange={(e) => patch({ token: e.target.value })}
                placeholder="ghp_… atau github_pat_…" autoComplete="off" spellCheck={false} className="pr-11 font-mono" />
              <button type="button" onClick={() => setShowToken((v) => !v)} aria-label="Tampilkan/sembunyikan token"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <div className="flex items-start justify-between gap-3 border rounded-lg p-3">
              <div className="space-y-0.5">
                <Label htmlFor="remember" className="text-sm">Ingat token di perangkat ini</Label>
                <p className="text-xs text-muted-foreground">
                  Mati (disarankan): token hanya hidup selama tab terbuka. Hidup: token disimpan <b>tanpa enkripsi</b> di browser ini — jangan aktifkan di perangkat bersama.
                </p>
              </div>
              <Switch id="remember" checked={form.rememberToken} onCheckedChange={(v) => patch({ rememberToken: v })} />
            </div>
            <p className="text-xs text-muted-foreground flex gap-2 items-start">
              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
              Token hanya dikirim langsung dari browser ke <code>api.github.com</code>, tidak lewat server kami. Tetap beri akses seminimal mungkin (satu repo lewat fine-grained token lebih aman).
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Repositori</Label>
              {repositories.length > 0 ? (
                <Select value={selectedFull} onValueChange={onPickRepo}>
                  <SelectTrigger><SelectValue placeholder="Pilih repositori" /></SelectTrigger>
                  <SelectContent>
                    {repositories.map((r) => <SelectItem key={r.id} value={r.full_name}>{r.full_name}{r.private ? " 🔒" : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Input value={form.username} onChange={(e) => patch({ username: e.target.value })} placeholder="owner" aria-label="Owner" autoComplete="off" />
                  <Input value={form.repo} onChange={(e) => patch({ repo: e.target.value })} placeholder="repo" aria-label="Repositori" autoComplete="off" />
                </div>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="branch">Branch</Label>
              {branches.length > 0 ? (
                <Select value={form.branch} onValueChange={(v) => patch({ branch: v })}>
                  <SelectTrigger id="branch"><SelectValue placeholder="Pilih branch" /></SelectTrigger>
                  <SelectContent>{branches.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                </Select>
              ) : (
                <Input id="branch" value={form.branch} onChange={(e) => patch({ branch: e.target.value })} placeholder="main" autoComplete="off" />
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="folder">Target folder (opsional)</Label>
              <Input id="folder" value={form.targetFolder} onChange={(e) => patch({ targetFolder: e.target.value })} placeholder="mis. assets/images" autoComplete="off" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="msg">Pesan commit</Label>
              <Input id="msg" value={form.commitMessageTemplate} onChange={(e) => patch({ commitMessageTemplate: e.target.value })} placeholder="Upload {filename}" />
              <p className="text-xs text-muted-foreground">Variabel: <code>{"{filename}"}</code> <code>{"{count}"}</code> <code>{"{date}"}</code></p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="secondary" onClick={() => { if (!form.token) return toast.error("Token diperlukan"); void handleSave().then(refreshUser) }}>Simpan &amp; uji koneksi</Button>
            {user && !userError && <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400"><CheckCircle2 className="h-4 w-4" /> Terhubung sebagai @{user.login}</span>}
            {userError && <span className="flex items-center gap-1 text-sm text-destructive"><XCircle className="h-4 w-4" /> {userError}</span>}
          </div>
          {user && !hasRepoScope && (
            <p className="text-sm text-amber-600 dark:text-amber-400">Token classic ini tidak punya scope <code>repo</code> — unggahan ke repo privat akan gagal.</p>
          )}
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row justify-between gap-4 border-t p-6 bg-muted/20">
          <div className="flex gap-2 w-full sm:w-auto justify-center sm:justify-start">
            <Button variant="outline" size="icon" title="Ekspor konfigurasi (tanpa token)" aria-label="Ekspor konfigurasi" onClick={exportConfig}><Download className="h-4 w-4" /></Button>
            <input type="file" ref={fileRef} className="hidden" accept=".json,application/json" onChange={importConfig} />
            <Button variant="outline" size="icon" title="Impor konfigurasi" aria-label="Impor konfigurasi" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /></Button>
          </div>
          <div className="flex gap-2 w-full sm:w-auto flex-col sm:flex-row">
            <Button variant="destructive" onClick={handleClear} className="w-full sm:w-auto"><Trash className="mr-2 h-4 w-4" /> Hapus sesi</Button>
            <Button onClick={handleSave} className="w-full sm:w-auto"><Save className="mr-2 h-4 w-4" /> Simpan</Button>
          </div>
        </CardFooter>
      </Card>

      {user && !userError && (
        <Card>
          <CardContent className="p-6 text-center">
            <Avatar className="h-20 w-20 mx-auto mb-3">
              <AvatarImage src={user.avatar_url} alt={user.login} />
              <AvatarFallback>{user.login?.substring(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <h4 className="text-xl font-bold">{user.name || user.login}</h4>
            <p className="text-muted-foreground">@{user.login}</p>
            <p className="text-xs text-muted-foreground mt-3">
              {scopes === null ? "Fine-grained token (scope tidak ditampilkan GitHub)" : `Scope: ${scopes.join(", ") || "—"}`}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
