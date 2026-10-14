"use client"

import { useState, useRef, useCallback, useMemo } from "react"
import { useDropzone } from "react-dropzone"
import { toast } from "sonner"
import { FolderUp, FileArchive, Eye, Rocket, ExternalLink, CheckCircle2, AlertTriangle, Check, GitBranch, ChevronDown, Layers, Eraser, Plus, Minus, Equal, Pencil } from "lucide-react"
import { useGithub } from "@/lib/github-context"
import { useShell } from "@/components/shell/shell-context"
import { ViewHeader, Eyebrow } from "@/components/shell/view-header"
import { Emblem } from "@/components/brand/logo"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FileTree } from "@/components/dashboard/file-tree"
import { ProgressRing } from "@/components/dashboard/progress-ring"
import { RunConsole, type LogLine } from "@/components/dashboard/run-console"
import { ActivityHeatmap } from "@/components/dashboard/activity-heatmap"
import { GitHubClient } from "@/lib/zippush/github"
import { runPush, type EngineResult } from "@/lib/zippush/engine"
import { prepareEntries, normalizeFolder, formatCommitMessage } from "@/lib/zippush/paths"
import { withKeepAlive } from "@/lib/zippush/runtime"
import type { ExtractedFile, LogType } from "@/lib/zippush/types"
import { cn } from "@/lib/utils"

interface QueueItem {
  id: string
  path: string
  size: number
  executable?: boolean
  load: () => Promise<Uint8Array>
}
interface Outcome { result: EngineResult; dryRun: boolean; commitUrl?: string }

let seq = 0
const nextId = () => `q${++seq}`
const fmt = (b: number) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`)
const time = () => new Date().toTimeString().slice(0, 8)

function fileItem(file: File): QueueItem {
  // react-dropzone mengisi `path` (termasuk folder yang di-drop); input folder mengisi webkitRelativePath
  const raw = (file as File & { path?: string }).path || file.webkitRelativePath || file.name
  return { id: nextId(), path: raw, size: file.size, load: async () => new Uint8Array(await file.arrayBuffer()) }
}

async function zipItems(file: File): Promise<QueueItem[]> {
  const { default: JSZip } = await import("jszip") // dimuat hanya saat ZIP dipilih
  const zip = await JSZip.loadAsync(file)
  const out: QueueItem[] = []
  zip.forEach((path, entry) => {
    if (entry.dir) return
    const executable = entry.unixPermissions != null && (Number(entry.unixPermissions) & 0o111) !== 0
    const size = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0
    out.push({ id: nextId(), path, size, executable, load: () => entry.async("uint8array") })
  })
  return out
}

export function Uploader() {
  const { setView } = useShell()
  const { config, setConfig, owner, isConfigured, recordUploads, bumpContents, repositories, reposLoading, branches } = useGithub()
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [busy, setBusy] = useState<"" | "zip" | "run">("")
  const [progress, setProgress] = useState(0)
  const [logs, setLogs] = useState<LogLine[]>([])
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [autoStrip, setAutoStrip] = useState(true)
  const [mirror, setMirror] = useState(false)
  const [autoExtract, setAutoExtract] = useState(true)
  const [confirmInfo, setConfirmInfo] = useState<null | { deleted: number; added: number; modified: number; kept: number; sample: string[] }>(null)
  const folderRef = useRef<HTMLInputElement>(null)
  const zipRef = useRef<HTMLInputElement>(null)
  const logId = useRef(0)
  const running = busy === "run"
  const [showLog, setShowLog] = useState(true)

  const add = useCallback((items: QueueItem[]) => {
    setOutcome(null); setError(null)
    setQueue((prev) => [...prev, ...items])
  }, [])

  const onDrop = useCallback(async (files: File[]) => {
    const zips = autoExtract ? files.filter((f) => /\.zip$/i.test(f.name)) : []
    const rest = files.filter((f) => !zips.includes(f))
    if (rest.length) add(rest.map(fileItem))
    if (!zips.length) return
    setBusy("zip")
    try {
      for (const z of zips) {
        const items = await zipItems(z)
        add(items)
        toast.success(`ZIP "${z.name}" diekstrak: ${items.length} file`)
      }
    } catch {
      toast.error("Gagal membaca ZIP (file rusak atau bukan ZIP).")
    } finally {
      setBusy("")
    }
  }, [add, autoExtract])
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop })

  const onFolder = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) add(Array.from(e.target.files).map(fileItem))
    e.target.value = ""
  }

  const onZip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setBusy("zip")
    try {
      const items = await zipItems(file)
      add(items)
      toast.success(`ZIP dibaca: ${items.length} file`)
    } catch {
      toast.error("Gagal membaca ZIP (file rusak atau bukan ZIP).")
    } finally {
      setBusy("")
    }
  }

  const totalSize = useMemo(() => queue.reduce((s, q) => s + q.size, 0), [queue])
  const target = `${owner || "?"}/${config.repo || "?"} @ ${config.branch}${config.targetFolder.trim() ? ` / ${config.targetFolder.trim().replace(/^\/+|\/+$/g, "")}` : ""}`

  const execute = async (dryRun: boolean, silent = false): Promise<EngineResult | null> => {
    if (!isConfigured) { toast.error("Lengkapi pengaturan GitHub dulu (token, repo, branch)."); return null }
    if (!queue.length) { toast.error("Antrean kosong."); return null }
    let prefix: string
    try { prefix = normalizeFolder(config.targetFolder) } catch (e) { toast.error((e as Error).message); return null }

    setBusy("run"); setProgress(0); setLogs([]); setOutcome(null); setError(null); setShowLog(true)
    const log = (type: LogType, msg: string) =>
      setLogs((l) => [...l.slice(-300), { id: ++logId.current, type, msg, t: time() }])

    try {
      const result = await withKeepAlive(async () => {
        log("info", `Membaca ${queue.length} file…`)
        const files: ExtractedFile[] = []
        for (const q of queue) files.push({ path: q.path, data: await q.load(), executable: q.executable })

        const { entries, skipped, stripRoot } = prepareEntries(files, { autoStrip, prefix })
        if (stripRoot) log("info", `Folder pembungkus dibuang: ${stripRoot}/`)
        if (skipped) log("warn", `${skipped} entri dilewati (sampah macOS/Windows, .git, path tidak aman, duplikat)`)

        const gh = new GitHubClient({ token: config.token, owner, repo: config.repo.trim() }, { onRetry: (m) => log("warn", m) })
        return runPush(
          gh,
          {
            branch: config.branch.trim(),
            commitMessage: formatCommitMessage(config.commitMessageTemplate, entries.map((e) => e.path)),
            entries, clearRepo: mirror, scopePrefix: prefix, skipped, dryRun,
          },
          { log, progress: (p) => setProgress((prev) => Math.max(prev, p)), fileDone: () => {} }
        )
      })

      const commitUrl = result.commitSha ? `https://github.com/${owner}/${config.repo.trim()}/commit/${result.commitSha}` : undefined
      if (!silent) setOutcome({ result, dryRun, commitUrl })
      if (!dryRun) {
        recordUploads(result.summary.added + result.summary.modified)
        bumpContents()
        setQueue([]) // hanya dikosongkan saat sukses — kalau gagal, antrean tetap utuh untuk dicoba lagi
        toast.success(result.commitSha ? "Berhasil di-push dalam 1 commit" : "Repo sudah sama dengan isi antrean")
      }
      setShowLog(false) // sukses: ringkas log, tampilkan hasilnya
      return result
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error"
      log("err", msg); setError(msg)
      toast.error(msg)
      return null
    } finally {
      setBusy("")
    }
  }

  const startPush = async () => {
    if (!mirror) { await execute(false); return }
    // Mirror = destruktif. Hitung dulu (tanpa menulis apa pun), lalu minta konfirmasi dengan ANGKA NYATA.
    const r = await execute(true, true)
    if (!r) return
    if (r.changes.deleted.length === 0) { await execute(false); return }
    setConfirmInfo({
      deleted: r.changes.deleted.length, added: r.changes.added.length, modified: r.changes.modified.length,
      kept: r.summary.unchanged, sample: r.changes.deleted.slice(0, 8),
    })
  }
  const ch = outcome?.result.changes
  const sm = outcome?.result.summary
  const stage = queue.length === 0 ? (outcome && !outcome.dryRun ? 3 : 0) : outcome?.dryRun ? 2 : 1
  const changeCount = ch ? ch.added.length + ch.modified.length + ch.deleted.length : 0
  const phase = logs.length ? logs[logs.length - 1].msg : "Menyiapkan…"

  const Step = ({ i, label }: { i: number; label: string }) => {
    const done = stage > i
    const on = stage === i
    return (
      <li className="flex items-center gap-2">
        <span className={cn("grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold transition-colors",
          done ? "bg-ember text-primary-foreground" : on ? "border-2 border-primary text-foreground" : "border border-input text-muted-foreground")}>
          {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
        </span>
        <span className={cn("text-xs font-bold", on || done ? "text-foreground" : "text-muted-foreground")}>{label}</span>
      </li>
    )
  }

  return (
    <div className="space-y-5">
      <ViewHeader eyebrow="Kirim" title="Unggah ke GitHub" subtitle="Seret file, folder, atau ZIP. Satu klik, satu commit — hanya yang berubah yang dikirim." />

      <ol className="flex items-center gap-3 overflow-x-auto" aria-label="Langkah">
        <Step i={0} label="Sumber" /><span className="h-px min-w-4 flex-1 bg-border" />
        <Step i={1} label="Tinjau" /><span className="h-px min-w-4 flex-1 bg-border" />
        <Step i={2} label="Luncurkan" />
      </ol>

      {/* ───── tujuan ───── */}
      {!config.token ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex flex-col items-start gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between sm:pt-6">
            <p className="text-sm">Masukkan token GitHub di tab <b>Pengaturan</b> sebelum mengunggah.</p>
            <Button size="sm" onClick={() => setView("settings")}>Buka Pengaturan</Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-3 pt-5 sm:pt-6">
            <Eyebrow>Tujuan</Eyebrow>
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Repositori tujuan</Label>
                <Select
                  value={config.repo ? `${owner}/${config.repo.trim()}` : ""}
                  onValueChange={(full) => {
                    const r = repositories.find((x) => x.full_name === full)
                    if (r) void setConfig({ ...config, username: r.owner.login, repo: r.name, branch: r.default_branch || "main" })
                  }}
                  disabled={running || reposLoading || repositories.length === 0}
                >
                  <SelectTrigger aria-label="Repositori tujuan">
                    <SelectValue placeholder={reposLoading ? "Memuat repositori…" : repositories.length ? "Pilih repositori" : "Tidak ada repositori"} />
                  </SelectTrigger>
                  <SelectContent>
                    {repositories.map((r) => (
                      <SelectItem key={r.id} value={r.full_name}>{r.full_name}{r.private ? " 🔒" : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Branch</Label>
                <Select
                  value={config.branch}
                  onValueChange={(b) => void setConfig({ ...config, branch: b })}
                  disabled={running || !config.repo || branches.length === 0}
                >
                  <SelectTrigger aria-label="Branch"><SelectValue placeholder="Branch" /></SelectTrigger>
                  <SelectContent>
                    {(branches.includes(config.branch) ? branches : [config.branch, ...branches]).filter(Boolean).map((b) => (
                      <SelectItem key={b} value={b}>{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {isConfigured ? (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <GitBranch className="h-3.5 w-3.5" /> Unggah ke <code className="break-all rounded-md bg-secondary px-1.5 py-0.5 font-mono text-foreground">{target}</code>
                <button type="button" onClick={() => setView("settings")} className="inline-flex items-center gap-1 text-foreground underline decoration-primary underline-offset-4"><Pencil className="h-3 w-3" /> folder &amp; pesan commit</button>
              </p>
            ) : (
              <p className="text-xs font-semibold text-destructive">Pilih repositori tujuan terlebih dulu.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ───── landasan ───── */}
      <div
        {...getRootProps()}
        className={cn(
          "grain relative cursor-pointer overflow-hidden rounded-[2rem] border-2 border-dashed px-6 py-10 text-center transition-all duration-200 sm:py-14",
          isDragActive ? "scale-[1.01] border-primary bg-primary/10 shadow-glow" : "border-input bg-card/60 hover:border-ember hover:bg-card"
        )}
      >
        <input {...getInputProps()} />
        <div className="relative mx-auto mb-5 grid h-24 w-24 place-items-center">
          <span className={cn("absolute inset-0 rounded-full bg-ember opacity-20 blur-2xl", isDragActive && "animate-ember-pulse opacity-60")} />
          <span className="relative grid h-20 w-20 place-items-center rounded-[1.6rem] border bg-card shadow-soft"><Emblem size={44} /></span>
        </div>
        <p className="font-display text-lg font-bold sm:text-xl">{isDragActive ? "Lepaskan untuk menambahkan" : "Lepas file, folder, atau ZIP di sini"}</p>
        <p className="mt-1 text-sm text-muted-foreground">atau ketuk area ini untuk memilih berkas</p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2.5">
        <input type="file" ref={folderRef} className="hidden" multiple onChange={onFolder} {...({ webkitdirectory: "true", directory: "true" } as Record<string, string>)} />
        <Button variant="secondary" size="sm" onClick={() => folderRef.current?.click()}><FolderUp className="h-4 w-4" /> Pilih Folder</Button>
        <input type="file" ref={zipRef} className="hidden" accept=".zip,application/zip" onChange={onZip} />
        <Button variant="secondary" size="sm" disabled={busy === "zip"} onClick={() => zipRef.current?.click()}>
          <FileArchive className="h-4 w-4" /> {busy === "zip" ? "Membaca ZIP…" : "Ekstrak & Unggah ZIP"}
        </Button>
        <label htmlFor="autozip" className="flex cursor-pointer items-center gap-2 rounded-xl border bg-secondary/50 py-1 pl-3 pr-1.5 text-xs font-semibold text-muted-foreground">
          Ekstrak otomatis file .zip yang di-drop
          <Switch id="autozip" checked={autoExtract} onCheckedChange={setAutoExtract} className="h-6 w-10 [&>span]:h-5 [&>span]:w-5 [&>span]:data-[state=checked]:translate-x-4" />
        </label>
      </div>

      {/* ───── antrean ───── */}
      {queue.length > 0 && (
        <Card className="animate-rise">
          <CardContent className="space-y-4 pt-5 sm:pt-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-bold">Antrean Unggahan</h3>
                <p className="text-sm text-muted-foreground">{queue.length} file{totalSize > 0 ? ` · ${fmt(totalSize)}` : ""}</p>
              </div>
              <Layers className="h-5 w-5 text-muted-foreground" />
            </div>

            <FileTree files={queue} disabled={running} onRemove={(ids) => setQueue((p) => p.filter((x) => !ids.includes(x.id)))} />

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-start justify-between gap-3 rounded-2xl border bg-secondary/40 p-3.5">
                <div className="space-y-0.5">
                  <Label htmlFor="strip" className="text-sm">Buang folder pembungkus</Label>
                  <p className="text-xs text-muted-foreground">Jika semua file ada di satu folder (mis. <code className="font-mono">proj/</code>), isinya dinaikkan ke root.</p>
                </div>
                <Switch id="strip" checked={autoStrip} onCheckedChange={setAutoStrip} disabled={running} />
              </div>
              <div className={cn("flex items-start justify-between gap-3 rounded-2xl border p-3.5 transition-colors", mirror ? "border-destructive/60 bg-destructive/10" : "bg-secondary/40")}>
                <div className="space-y-0.5">
                  <Label htmlFor="mirror" className="text-sm">Hapus file lama (mirror)</Label>
                  <p className="text-xs text-muted-foreground">Hapus file di repo yang tidak ada di antrean{config.targetFolder.trim() ? " — hanya di dalam target folder" : " — seluruh repo"}.</p>
                </div>
                <Switch id="mirror" checked={mirror} onCheckedChange={setMirror} disabled={running} />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ───── bilah aksi (menempel) ───── */}
      {queue.length > 0 && (
        <div className="sticky bottom-24 z-20 flex gap-2 rounded-3xl border bg-card/90 p-2 shadow-2xl backdrop-blur-xl lg:bottom-6">
          <Button variant="ghost" aria-label="Bersihkan" className="shrink-0 px-3 sm:px-5" onClick={() => { setQueue([]); setOutcome(null); setError(null) }} disabled={running}><Eraser className="h-4 w-4" /><span className="hidden sm:inline">Bersihkan</span></Button>
          <Button variant="secondary" className="min-w-0 flex-1 px-3" onClick={() => execute(true)} disabled={running || !isConfigured}><Eye className="h-4 w-4" /> Pratinjau</Button>
          <Button className="min-w-0 flex-[1.4] px-3" onClick={startPush} disabled={running || !isConfigured}><Rocket className="h-4 w-4" /> {running ? "Meluncur…" : "Unggah"}</Button>
        </div>
      )}

      {/* ───── berjalan / log ───── */}
      {(running || logs.length > 0) && (
        <Card className="animate-rise overflow-hidden">
          {running && <div className="h-1 w-full animate-shimmer bg-[length:200%_100%]" style={{ backgroundImage: "linear-gradient(90deg, transparent, var(--ember-from), var(--ember-to), transparent)" }} />}
          <CardContent className="space-y-4 pt-5 sm:pt-6">
            {running && (
              <div className="flex items-center gap-4">
                <ProgressRing value={progress} />
                <div className="min-w-0">
                  <h3 className="font-display text-lg font-bold">Sedang meluncur…</h3>
                  <p className="truncate text-sm text-muted-foreground">{phase}</p>
                </div>
              </div>
            )}
            <button type="button" onClick={() => setShowLog((v) => !v)} aria-expanded={showLog} className="flex w-full items-center justify-between rounded-xl px-1 text-sm font-bold">
              <span>Log</span><ChevronDown className={cn("h-4 w-4 transition-transform", showLog && "rotate-180")} />
            </button>
            {showLog && <RunConsole logs={logs} />}
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="animate-rise border-destructive/50 bg-destructive/10">
          <CardContent className="flex items-start gap-3 pt-5 text-sm sm:pt-6">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div className="min-w-0">
              <p className="font-bold">Gagal — antrean Anda tetap utuh, aman dicoba lagi.</p>
              <p className="mt-1 break-words text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ───── hasil / pratinjau ───── */}
      {outcome && sm && ch && (
        <Card className={cn("animate-rise overflow-hidden", !outcome.dryRun && "border-success/40")}>
          <div className={cn("h-1 w-full", outcome.dryRun ? "bg-ember" : "bg-success")} />
          <CardContent className="space-y-4 pt-5 sm:pt-6">
            <div className="flex items-start gap-3">
              <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-2xl", outcome.dryRun ? "bg-primary/15 text-primary" : "bg-success/15 text-success")}>
                {outcome.dryRun ? <Eye className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
              </span>
              <div className="min-w-0">
                <h3 className="font-display text-lg font-bold">{outcome.dryRun ? "Pratinjau perubahan" : outcome.commitUrl ? "Berhasil di-push" : "Sudah up to date"}</h3>
                <p className="text-sm text-muted-foreground">{outcome.dryRun ? "Belum ada yang ditulis ke GitHub." : `${sm.requests} request API untuk seluruh perubahan.`}</p>
              </div>
            </div>

            <p className="sr-only">+{sm.added} baru · ~{sm.modified} diubah · −{sm.deleted} dihapus · ={sm.unchanged} sama · {sm.requests} request API</p>
            <div className="grid grid-cols-4 gap-2 text-center" aria-hidden>
              {[
                { l: "Baru", n: sm.added, c: "text-success", i: Plus },
                { l: "Diubah", n: sm.modified, c: "text-warn", i: Pencil },
                { l: "Dihapus", n: sm.deleted, c: "text-destructive", i: Minus },
                { l: "Sama", n: sm.unchanged, c: "text-muted-foreground", i: Equal },
              ].map(({ l, n, c, i: I }) => (
                <div key={l} className="rounded-2xl border bg-secondary/40 px-1 py-3">
                  <I className={cn("mx-auto mb-1 h-3.5 w-3.5", c)} />
                  <p className={cn("font-display text-xl font-bold tabular-nums", n === 0 && "opacity-40")}>{n}</p>
                  <p className="text-[11px] font-semibold text-muted-foreground">{l}</p>
                </div>
              ))}
            </div>

            {outcome.dryRun && changeCount > 0 && (
              <div className="scroll-thin max-h-52 space-y-0.5 overflow-y-auto rounded-2xl border bg-background/50 p-2 font-mono text-xs">
                {[...ch.added.map((p) => ["+", p, "text-success"]), ...ch.modified.map((p) => ["~", p, "text-warn"]), ...ch.deleted.map((p) => ["−", p, "text-destructive"])]
                  .slice(0, 200).map(([s, p, c]) => <div key={s + p} className={cn("flex gap-2 rounded-lg px-2 py-1", c)}><span className="w-3 shrink-0 font-bold">{s}</span><span className="min-w-0 break-all text-foreground">{p}</span></div>)}
              </div>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              {outcome.dryRun && changeCount > 0 && <Button onClick={startPush} disabled={running}><Rocket className="h-4 w-4" /> Unggah sekarang</Button>}
              {outcome.commitUrl && (
                <Button asChild variant="secondary"><a href={outcome.commitUrl} target="_blank" rel="noreferrer noopener"><ExternalLink className="h-4 w-4" /> Lihat commit</a></Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <ActivityHeatmap />

      <Dialog open={!!confirmInfo} onOpenChange={(o) => !o && setConfirmInfo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus {confirmInfo?.deleted} file dari repo?</DialogTitle>
            <DialogDescription>
              Mode mirror akan menghapus <b>{confirmInfo?.deleted}</b> file di <b>{target}</b>{config.targetFolder.trim() ? " (hanya di dalam target folder)" : ""},
              menambah <b>{confirmInfo?.added}</b>, mengubah <b>{confirmInfo?.modified}</b>, dan mempertahankan <b>{confirmInfo?.kept}</b>.
              Riwayat git tetap menyimpan versi lama, jadi bisa dipulihkan.
            </DialogDescription>
          </DialogHeader>
          {confirmInfo && confirmInfo.deleted > confirmInfo.kept + confirmInfo.added + confirmInfo.modified && (
            <div className="flex items-start gap-2 rounded-2xl border border-destructive/60 bg-destructive/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <p>Antrean Anda ({queue.length} file) jauh lebih kecil dari isi repo — sebagian besar repo akan terhapus. Kalau Anda memilih sebuah <b>.zip</b>, pastikan ia diekstrak (bukan diunggah sebagai satu file).</p>
            </div>
          )}
          <div className="scroll-thin max-h-32 overflow-y-auto rounded-2xl border bg-background/50 p-2 font-mono text-xs text-destructive">
            {confirmInfo?.sample.map((p) => <div key={p}>− {p}</div>)}
            {confirmInfo && confirmInfo.deleted > confirmInfo.sample.length && <div className="text-muted-foreground">…dan {confirmInfo.deleted - confirmInfo.sample.length} lainnya</div>}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setConfirmInfo(null)}>Batal</Button>
            <Button variant="destructive" onClick={() => { setConfirmInfo(null); void execute(false) }}>Ya, hapus {confirmInfo?.deleted} file &amp; unggah</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
