"use client"

import { useState, useRef, useEffect, type ReactNode } from "react"
import { toast } from "sonner"
import { Download, Upload, Trash, Save, CheckCircle2, XCircle, Eye, EyeOff, ShieldAlert, ExternalLink, KeyRound, Target, Database } from "lucide-react"
import { useGithub, defaultConfig, type GitHubConfig } from "@/lib/github-context"
import { ViewHeader } from "@/components/shell/view-header"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { normalizeFolder } from "@/lib/zippush/paths"

const TOKEN_URL = "https://github.com/settings/tokens/new?scopes=repo,workflow&description=Naquth"

function Section({ n, icon, title, desc, children }: { n: number; icon: ReactNode; title: string; desc: string; children: ReactNode }) {
  return (
    <Card>
      <CardContent className="space-y-5 pt-5 sm:pt-6">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-foreground">{icon}</span>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand">Langkah {n}</p>
            <h2 className="font-display text-lg font-bold leading-tight">{title}</h2>
            <p className="text-sm text-muted-foreground">{desc}</p>
          </div>
        </div>
        {children}
      </CardContent>
    </Card>
  )
}

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
  const broadScopes = (scopes ?? []).filter((s) => s.startsWith("admin:"))

  return (
    <div>
      <ViewHeader eyebrow="Atur" title="Pengaturan" subtitle="Hubungkan akun, pilih tujuan, dan atur data lokal. Semuanya hanya di browser ini." />

      <div className="space-y-4">
        {/* ───── 1. akun ───── */}
        <Section n={1} icon={<KeyRound className="h-5 w-5" />} title="Akun GitHub" desc="Token dikirim langsung dari browser ke api.github.com — tidak lewat server kami.">
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="token">Personal Access Token</Label>
              <a href={TOKEN_URL} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs font-semibold underline decoration-primary underline-offset-4">
                Buat token <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="relative">
              <Input id="token" type={showToken ? "text" : "password"} value={form.token} onChange={(e) => patch({ token: e.target.value })}
                placeholder="ghp_… atau github_pat_…" autoComplete="off" spellCheck={false} className="pr-12 font-mono" />
              <button type="button" onClick={() => setShowToken((v) => !v)} aria-label="Tampilkan/sembunyikan token"
                className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground">
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-start justify-between gap-3 rounded-2xl border bg-secondary/40 p-3.5">
            <div className="space-y-0.5">
              <Label htmlFor="remember" className="text-sm">Ingat token di perangkat ini</Label>
              <p className="text-xs text-muted-foreground">
                Mati (disarankan): token hanya hidup selama tab terbuka. Hidup: disimpan <b>tanpa enkripsi</b> di browser ini — jangan aktifkan di perangkat bersama.
              </p>
            </div>
            <Switch id="remember" checked={form.rememberToken} onCheckedChange={(v) => patch({ rememberToken: v })} />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={() => { if (!form.token) return toast.error("Token diperlukan"); void handleSave().then(refreshUser) }}>Simpan &amp; uji koneksi</Button>
            {user && !userError && <span className="flex items-center gap-1.5 text-sm font-semibold text-success"><CheckCircle2 className="h-4 w-4" /> Terhubung sebagai @{user.login}</span>}
            {userError && <span className="flex items-center gap-1.5 text-sm font-semibold text-destructive"><XCircle className="h-4 w-4" /> {userError}</span>}
          </div>

          {user && !userError && (
            <div className="flex items-center gap-3 rounded-2xl border bg-secondary/40 p-3.5">
              <Avatar className="h-12 w-12 ring-2 ring-primary/60">
                <AvatarImage src={user.avatar_url} alt={user.login} />
                <AvatarFallback>{user.login?.substring(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{user.name || user.login}</p>
                <p className="break-words font-mono text-[11px] text-muted-foreground">
                  {scopes === null ? "Fine-grained token (scope tidak ditampilkan GitHub)" : `Scope: ${scopes.join(", ") || "—"}`}
                </p>
              </div>
            </div>
          )}
          {user && broadScopes.length > 0 && (
            <p className="flex items-start gap-2 rounded-2xl border border-warn/40 bg-warn/10 p-3 text-sm">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
              <span>Token ini punya akses sangat luas ({broadScopes.slice(0, 3).join(", ")}{broadScopes.length > 3 ? ", …" : ""}). Naquth hanya butuh <code className="font-mono">repo</code> (+ <code className="font-mono">workflow</code>). Buat token baru yang lebih sempit — idealnya fine-grained untuk satu repo — lalu cabut yang ini.</span>
            </p>
          )}
          {user && !hasRepoScope && (
            <p className="text-sm font-semibold text-warn">Token classic ini tidak punya scope <code className="font-mono">repo</code> — unggahan ke repo privat akan gagal.</p>
          )}
        </Section>

        {/* ───── 2. tujuan ───── */}
        <Section n={2} icon={<Target className="h-5 w-5" />} title="Tujuan & commit" desc="Ke mana file dikirim dan bagaimana commit diberi nama.">
          <div className="grid gap-4 sm:grid-cols-2">
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
            <div className="grid gap-2">
              <Label htmlFor="folder">Target folder (opsional)</Label>
              <Input id="folder" value={form.targetFolder} onChange={(e) => patch({ targetFolder: e.target.value })} placeholder="mis. assets/images" autoComplete="off" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="msg">Pesan commit</Label>
              <Input id="msg" value={form.commitMessageTemplate} onChange={(e) => patch({ commitMessageTemplate: e.target.value })} placeholder="Upload {filename}" />
              <p className="text-xs text-muted-foreground">Variabel: <code className="font-mono">{"{filename}"}</code> <code className="font-mono">{"{count}"}</code> <code className="font-mono">{"{date}"}</code></p>
            </div>
          </div>
        </Section>

        {/* ───── 3. data ───── */}
        <Section n={3} icon={<Database className="h-5 w-5" />} title="Data lokal" desc="Cadangkan pengaturan (tanpa token) atau bersihkan sesi di perangkat ini.">
          <div className="flex flex-wrap gap-2">
            <input type="file" ref={fileRef} className="hidden" accept=".json,application/json" onChange={importConfig} />
            <Button variant="secondary" size="sm" title="Ekspor konfigurasi (tanpa token)" aria-label="Ekspor konfigurasi" onClick={exportConfig}><Download className="h-4 w-4" /> Ekspor</Button>
            <Button variant="secondary" size="sm" title="Impor konfigurasi" aria-label="Impor konfigurasi" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Impor</Button>
            <Button variant="destructive" size="sm" onClick={handleClear}><Trash className="h-4 w-4" /> Hapus sesi</Button>
          </div>
        </Section>
      </div>

      <div className="sticky bottom-24 z-20 mt-5 flex justify-end rounded-3xl border bg-card/90 p-2 shadow-2xl backdrop-blur-xl lg:bottom-6">
        <Button onClick={handleSave} className="w-full sm:w-auto sm:px-10"><Save className="h-4 w-4" /> Simpan</Button>
      </div>
    </div>
  )
}
