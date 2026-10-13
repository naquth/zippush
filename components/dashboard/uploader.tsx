"use client"

import { useState, useRef, useCallback, useMemo } from "react"
import { useDropzone } from "react-dropzone"
import { toast } from "sonner"
import { UploadCloud, FolderUp, FileArchive, X, Eye, Rocket, ExternalLink, CheckCircle2, AlertTriangle } from "lucide-react"
import { useGithub } from "@/lib/github-context"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { GitHubClient } from "@/lib/zippush/github"
import { runPush, type EngineResult } from "@/lib/zippush/engine"
import { prepareEntries, normalizeFolder, formatCommitMessage } from "@/lib/zippush/paths"
import { withKeepAlive } from "@/lib/zippush/runtime"
import type { ExtractedFile, LogType } from "@/lib/zippush/types"

interface QueueItem {
  id: string
  path: string
  size: number
  executable?: boolean
  load: () => Promise<Uint8Array>
}
interface LogLine { id: number; type: LogType; msg: string; t: string }
interface Outcome { result: EngineResult; dryRun: boolean; commitUrl?: string }

let seq = 0
const nextId = () => `q${++seq}`
const fmt = (b: number) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`)
const time = () => new Date().toTimeString().slice(0, 8)
const logColor: Record<LogType, string> = {
  ok: "text-green-500", err: "text-red-500", warn: "text-amber-500", info: "text-sky-500", plain: "text-muted-foreground",
}

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
  const { config, setConfig, owner, isConfigured, recordUploads, bumpContents, repositories, reposLoading, branches } = useGithub()
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [busy, setBusy] = useState<"" | "zip" | "run">("")
  const [progress, setProgress] = useState(0)
  const [logs, setLogs] = useState<LogLine[]>([])
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [autoStrip, setAutoStrip] = useState(true)
  const [mirror, setMirror] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const folderRef = useRef<HTMLInputElement>(null)
  const zipRef = useRef<HTMLInputElement>(null)
  const logId = useRef(0)
  const running = busy === "run"

  const add = useCallback((items: QueueItem[]) => {
    setOutcome(null); setError(null)
    setQueue((prev) => [...prev, ...items])
  }, [])

  const onDrop = useCallback((files: File[]) => add(files.map(fileItem)), [add])
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

  const execute = async (dryRun: boolean) => {
    if (!isConfigured) return toast.error("Lengkapi pengaturan GitHub dulu (token, repo, branch).")
    if (!queue.length) return toast.error("Antrean kosong.")
    let prefix: string
    try { prefix = normalizeFolder(config.targetFolder) } catch (e) { return toast.error((e as Error).message) }

    setBusy("run"); setProgress(0); setLogs([]); setOutcome(null); setError(null)
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
      setOutcome({ result, dryRun, commitUrl })
      if (!dryRun) {
        recordUploads(result.summary.added + result.summary.modified)
        bumpContents()
        setQueue([]) // hanya dikosongkan saat sukses — kalau gagal, antrean tetap utuh untuk dicoba lagi
        toast.success(result.commitSha ? "Berhasil di-push dalam 1 commit" : "Repo sudah sama dengan isi antrean")
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error"
      log("err", msg); setError(msg)
      toast.error(msg)
    } finally {
      setBusy("")
    }
  }

  const startPush = () => (mirror ? setConfirmOpen(true) : execute(false))
  const ch = outcome?.result.changes
  const sm = outcome?.result.summary

  return (
    <div className="space-y-6 max-w-4xl mx-auto mt-6">
      {!config.token ? (
        <Card className="bg-destructive/10 border-destructive">
          <CardContent className="p-4 text-center text-sm">
            Masukkan token GitHub di tab <b>Pengaturan</b> sebelum mengunggah.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-4 space-y-3">
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
              <p className="text-xs text-muted-foreground break-all">
                Unggah ke <code className="bg-muted px-1.5 py-0.5 rounded">{target}</code>
                {" "}— folder tujuan &amp; pesan commit diatur di tab Pengaturan.
              </p>
            ) : (
              <p className="text-xs text-destructive">Pilih repositori tujuan terlebih dulu.</p>
            )}
          </CardContent>
        </Card>
      )}

      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-8 sm:p-12 text-center cursor-pointer transition-colors ${isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"}`}
      >
        <input {...getInputProps()} />
        <UploadCloud className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-lg font-medium">Seret &amp; lepas file atau folder, atau ketuk untuk memilih</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <input
          type="file" ref={folderRef} className="hidden" multiple onChange={onFolder}
          {...({ webkitdirectory: "true", directory: "true" } as Record<string, string>)}
        />
        <Button variant="outline" className="w-full sm:w-auto" onClick={() => folderRef.current?.click()}>
          <FolderUp className="mr-2 h-4 w-4" /> Pilih Folder
        </Button>
        <input type="file" ref={zipRef} className="hidden" accept=".zip,application/zip" onChange={onZip} />
        <Button variant="outline" className="w-full sm:w-auto" disabled={busy === "zip"} onClick={() => zipRef.current?.click()}>
          <FileArchive className="mr-2 h-4 w-4" /> {busy === "zip" ? "Membaca ZIP…" : "Ekstrak & Unggah ZIP"}
        </Button>
      </div>

      {queue.length > 0 && (
        <Card>
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <CardTitle>Antrean Unggahan</CardTitle>
              <CardDescription>{queue.length} file{totalSize > 0 ? ` · ${fmt(totalSize)}` : ""}</CardDescription>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => { setQueue([]); setOutcome(null) }} disabled={running}>Bersihkan</Button>
              <Button variant="secondary" className="flex-1 sm:flex-none" onClick={() => execute(true)} disabled={running || !isConfigured}>
                <Eye className="mr-2 h-4 w-4" /> Pratinjau
              </Button>
              <Button className="flex-1 sm:flex-none" onClick={startPush} disabled={running || !isConfigured}>
                <Rocket className="mr-2 h-4 w-4" /> {running ? "Mengunggah…" : "Unggah"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-start justify-between gap-3 border rounded-lg p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="strip" className="text-sm">Buang folder pembungkus</Label>
                  <p className="text-xs text-muted-foreground">Jika semua file ada di satu folder (mis. <code>proj/</code>), isinya dinaikkan ke root.</p>
                </div>
                <Switch id="strip" checked={autoStrip} onCheckedChange={setAutoStrip} disabled={running} />
              </div>
              <div className={`flex items-start justify-between gap-3 border rounded-lg p-3 ${mirror ? "border-destructive bg-destructive/5" : ""}`}>
                <div className="space-y-0.5">
                  <Label htmlFor="mirror" className="text-sm">Hapus file lama (mirror)</Label>
                  <p className="text-xs text-muted-foreground">Hapus file di repo yang tidak ada di antrean{config.targetFolder.trim() ? " — hanya di dalam target folder" : " — seluruh repo"}.</p>
                </div>
                <Switch id="mirror" checked={mirror} onCheckedChange={setMirror} disabled={running} />
              </div>
            </div>

            <div className="max-h-56 overflow-y-auto border rounded-md">
              {queue.slice(0, 100).map((q) => (
                <div key={q.id} className="flex items-center justify-between px-3 py-2 border-b last:border-0 hover:bg-muted/50">
                  <p className="text-sm truncate flex-1 mr-3 font-mono">{q.path.replace(/^\.?\/+/, "")}</p>
                  <span className="text-xs text-muted-foreground mr-2">{q.size > 0 ? fmt(q.size) : ""}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled={running} aria-label="Hapus dari antrean"
                    onClick={() => setQueue((p) => p.filter((x) => x.id !== q.id))}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {queue.length > 100 && <p className="text-xs text-muted-foreground p-3 text-center">…dan {queue.length - 100} file lainnya</p>}
            </div>
          </CardContent>
        </Card>
      )}

      {(running || logs.length > 0) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{running ? "Sedang berjalan…" : error ? "Gagal" : "Log"}</CardTitle>
            {(running || progress > 0) && <Progress value={progress} className="h-2 mt-2" />}
          </CardHeader>
          <CardContent>
            <div className="bg-muted/40 rounded-md p-3 max-h-64 overflow-y-auto font-mono text-xs space-y-0.5" aria-live="polite">
              {logs.map((l) => (
                <div key={l.id} className={logColor[l.type]}>
                  <span className="opacity-50 mr-2">{l.t}</span>{l.msg}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="p-4 text-sm flex gap-3 items-start">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
            <div>
              <p className="font-medium">Gagal — antrean Anda tetap utuh, aman dicoba lagi.</p>
              <p className="text-muted-foreground mt-1 break-words">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {outcome && sm && ch && (
        <Card className={outcome.dryRun ? "" : "border-green-500/50 bg-green-500/5"}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {outcome.dryRun ? <Eye className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5 text-green-500" />}
              {outcome.dryRun ? "Pratinjau perubahan (belum ada yang ditulis)" : outcome.commitUrl ? "Berhasil di-push" : "Sudah up to date"}
            </CardTitle>
            <CardDescription>
              +{sm.added} baru · ~{sm.modified} diubah · −{sm.deleted} dihapus · ={sm.unchanged} sama · {sm.requests} request API
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {outcome.dryRun && (ch.added.length + ch.modified.length + ch.deleted.length) > 0 && (
              <div className="max-h-48 overflow-y-auto border rounded-md p-3 font-mono text-xs space-y-0.5">
                {[...ch.added.map((p) => ["+", p, "text-green-500"]), ...ch.modified.map((p) => ["~", p, "text-amber-500"]), ...ch.deleted.map((p) => ["−", p, "text-red-500"])]
                  .slice(0, 200).map(([s, p, c]) => <div key={s + p} className={c}>{s} {p}</div>)}
              </div>
            )}
            {outcome.dryRun && (ch.added.length + ch.modified.length + ch.deleted.length) > 0 && (
              <Button onClick={startPush} disabled={running} className="w-full sm:w-auto"><Rocket className="mr-2 h-4 w-4" /> Unggah sekarang</Button>
            )}
            {outcome.commitUrl && (
              <Button asChild variant="outline"><a href={outcome.commitUrl} target="_blank" rel="noreferrer noopener"><ExternalLink className="mr-2 h-4 w-4" /> Lihat commit</a></Button>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus file lama?</DialogTitle>
            <DialogDescription>
              File di <b>{target}</b> yang tidak ada di antrean akan <b>dihapus</b>{config.targetFolder.trim() ? " (hanya di dalam target folder)" : " (seluruh repo)"}. Anda bisa melihat daftarnya lewat <b>Pratinjau</b> lebih dulu. Riwayat git tetap menyimpan versi lama, jadi bisa dipulihkan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Batal</Button>
            <Button variant="destructive" onClick={() => { setConfirmOpen(false); execute(false) }}>Ya, hapus &amp; unggah</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
