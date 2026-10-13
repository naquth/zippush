import type { LogEntry, PushEntry, PushSummary, TreeItem } from '@/types'
import type { GitHubApi } from '@/utils/github'
import { gitBlobSha, toBase64, tryDecodeText } from '@/utils/encoding'

export interface EngineOptions {
  branch: string
  commitMessage: string
  entries: PushEntry[]
  clearRepo: boolean
  skipped: number
  /** jumlah upload blob paralel (default 6) */
  concurrency?: number
}

export interface EngineCallbacks {
  log: (type: LogEntry['type'], message: string) => void
  progress: (pct: number) => void
  /** file (index asli di ZIP) sudah beres / sudah sinkron */
  fileDone: (srcIndex: number) => void
}

export interface EngineResult {
  commitSha?: string
  summary: PushSummary
}

const TREE_CHUNK_ENTRIES = 250
const TREE_CHUNK_BYTES = 2 * 1024 * 1024
const MAX_FILE_BYTES = 100 * 1024 * 1024 // batas blob GitHub API
const LOG_FILE_LINES = 150

type Plan = { entry: PushEntry; sha: string | null; mode: string; kind: 'added' | 'modified' }

/**
 * Alur (semua langkah idempoten; tidak ada yang terlihat di repo sampai langkah terakhir):
 *  1. baca HEAD + tree repo (3 request)
 *  2. hitung SHA Git tiap file lokal & bandingkan → HANYA yang berubah yang dikirim
 *  3. file teks → inline di tree (0 request tambahan); biner → blob paralel (concurrency terbatas)
 *  4. tree dibuat berantai per-chunk, 1 commit, 1 update ref  ⇒ hasil akhir atomik
 */
export async function runPush(gh: GitHubApi, opts: EngineOptions, cb: EngineCallbacks): Promise<EngineResult> {
  const { branch, entries, clearRepo } = opts
  const summary: PushSummary = { added: 0, modified: 0, unchanged: 0, deleted: 0, skipped: opts.skipped, requests: 0 }
  const finish = <T extends EngineResult>(r: T) => ((r.summary.requests = gh.requestCount), r)

  if (!entries.length) throw new Error('ZIP has no pushable files (everything was filtered out).')
  const tooBig = entries.find((e) => e.data.byteLength > MAX_FILE_BYTES)
  if (tooBig) throw new Error(`"${tooBig.path}" exceeds GitHub's 100 MB per-file limit.`)

  // ── 1. state repo ──────────────────────────────────────────────
  cb.log('info', `Fetching branch: ${branch}`)
  const headSha = await gh.getBranchHead(branch)
  cb.log('ok', `Branch SHA: ${headSha.slice(0, 7)}`)
  cb.progress(5)
  const baseTreeSha = await gh.getCommitTree(headSha)
  const { blobs: remote, truncated } = await gh.getTreeBlobs(baseTreeSha)
  cb.log('ok', `Repo has ${remote.size} file${remote.size !== 1 ? 's' : ''}`)
  cb.progress(12)

  if (truncated) {
    if (clearRepo) throw new Error('Repository tree is too large to list completely — refusing to "delete all" safely.')
    cb.log('warn', 'Repo tree truncated by GitHub — change detection is partial (extra files may be re-sent).')
  }

  // ── 2. diff lokal vs remote ────────────────────────────────────
  cb.log('info', `Comparing ${entries.length} files with repository…`)
  const plans: Plan[] = []
  let lastYield = Date.now()
  for (const entry of entries) {
    const r = remote.get(entry.path)
    const sha = await gitBlobSha(entry.data)
    if (r && sha !== null && r.sha === sha) {
      summary.unchanged++
      cb.fileDone(entry.srcIndex)
    } else {
      const keepMode = r && (r.mode === '100644' || r.mode === '100755') ? r.mode : entry.mode
      plans.push({ entry, sha, mode: keepMode, kind: r ? 'modified' : 'added' })
    }
    if (Date.now() - lastYield > 50) { await new Promise((r) => setTimeout(r, 0)); lastYield = Date.now() } // jaga UI tetap responsif
  }
  cb.progress(25)

  // ── 3. penghapusan ─────────────────────────────────────────────
  const newPaths = new Set(entries.map((e) => e.path))
  const deletions = new Set<string>()
  if (clearRepo) for (const p of remote.keys()) if (!newPaths.has(p)) deletions.add(p)

  // konflik file↔folder: "a" (file) vs "a/b"; kalau tidak dibereskan GitHub menolak tree-nya
  const remoteDirs = new Map<string, string[]>()
  for (const p of remote.keys()) {
    const segs = p.split('/')
    for (let i = 1; i < segs.length; i++) {
      const d = segs.slice(0, i).join('/')
      const arr = remoteDirs.get(d)
      arr ? arr.push(p) : remoteDirs.set(d, [p])
    }
  }
  for (const e of entries) {
    const segs = e.path.split('/')
    for (let i = 1; i < segs.length; i++) {
      const parent = segs.slice(0, i).join('/')
      if (remote.has(parent) && !newPaths.has(parent)) deletions.add(parent)
    }
    for (const child of remoteDirs.get(e.path) ?? []) if (!newPaths.has(child)) deletions.add(child)
  }
  summary.deleted = deletions.size
  summary.added = plans.filter((p) => p.kind === 'added').length
  summary.modified = plans.length - summary.added

  if (!plans.length && !deletions.size) {
    cb.log('ok', `Nothing to push — repository already matches the ZIP (${summary.unchanged} files identical).`)
    cb.progress(100)
    return finish({ summary })
  }

  cb.log(
    'info',
    `Changes: +${summary.added} new · ~${summary.modified} modified · =${summary.unchanged} unchanged` +
      (summary.deleted ? ` · −${summary.deleted} deleted` : '')
  )
  logList(cb, plans.map((p) => `${p.kind === 'added' ? '+' : '~'} ${p.entry.path}`), summary.deleted ? [...deletions].map((p) => `− ${p}`) : [])

  // ── 4. siapkan item tree: teks inline, biner → blob paralel ────
  const items: TreeItem[] = []
  const inlineBytes: number[] = []
  const delItems: TreeItem[] = []
  const needBlob: Plan[] = []
  for (const p of plans) {
    const text = tryDecodeText(p.entry.data)
    if (text !== null) {
      items.push({ path: p.entry.path, mode: p.mode, type: 'blob', content: text })
      inlineBytes.push(p.entry.data.byteLength)
    } else needBlob.push(p)
  }
  for (const path of deletions) delItems.push({ path, mode: '100644', type: 'blob', sha: null })
  cb.log('info', `${items.length} text files inline · ${needBlob.length} binary/other as blobs`)

  if (needBlob.length) {
    let done = 0
    await pool(needBlob, opts.concurrency ?? 6, async (p) => {
      const sha = await gh.createBlob(toBase64(p.entry.data))
      items.push({ path: p.entry.path, mode: p.mode, type: 'blob', sha })
      inlineBytes.push(64)
      done++
      cb.progress(25 + Math.round((done / needBlob.length) * 50))
    })
    cb.log('ok', `Uploaded ${needBlob.length} blob${needBlob.length !== 1 ? 's' : ''} (parallel ×${Math.min(opts.concurrency ?? 6, needBlob.length)})`)
  }
  cb.progress(78)

  // ── 5. tree berantai → commit → ref ────────────────────────────
  // penghapusan lebih dulu (chain berurutan) agar konflik file↔folder beres sebelum penambahan
  const chunks = [
    ...chunkItems(delItems, delItems.map((d) => d.path.length)),
    ...chunkItems(items, inlineBytes),
  ]
  cb.log('info', `Creating tree (${chunks.length} request${chunks.length !== 1 ? 's' : ''})…`)
  let treeSha = baseTreeSha
  for (let i = 0; i < chunks.length; i++) {
    treeSha = await gh.createTree(treeSha, chunks[i])
    cb.progress(78 + Math.round(((i + 1) / chunks.length) * 12))
  }
  cb.log('ok', `Tree: ${treeSha.slice(0, 7)}`)
  for (const p of plans) cb.fileDone(p.entry.srcIndex)

  cb.log('info', 'Creating commit…')
  const commitSha = await gh.createCommit(opts.commitMessage, treeSha, headSha)
  cb.log('ok', `Commit: ${commitSha.slice(0, 7)}`)
  cb.progress(95)

  cb.log('info', `Updating ${branch}…`)
  try {
    await gh.updateRef(branch, commitSha)
  } catch (e) {
    const m = e instanceof Error ? e.message : ''
    if (/fast.?forward|422/i.test(m)) {
      throw new Error(`Branch "${branch}" changed on GitHub while pushing (someone else pushed). Nothing was overwritten — just push again.`)
    }
    throw e
  }
  cb.progress(100)
  return finish({ commitSha, summary })
}

// ───────────────────────── helpers ─────────────────────────

function logList(cb: EngineCallbacks, files: string[], dels: string[]) {
  const all = [...files, ...dels]
  all.slice(0, LOG_FILE_LINES).forEach((l) => cb.log('plain', `  ${l}`))
  if (all.length > LOG_FILE_LINES) cb.log('plain', `  …and ${all.length - LOG_FILE_LINES} more`)
}

function chunkItems(items: TreeItem[], sizes: number[]): TreeItem[][] {
  const chunks: TreeItem[][] = []
  let cur: TreeItem[] = []
  let bytes = 0
  items.forEach((it, i) => {
    if (cur.length && (cur.length >= TREE_CHUNK_ENTRIES || bytes + sizes[i] > TREE_CHUNK_BYTES)) {
      chunks.push(cur); cur = []; bytes = 0
    }
    cur.push(it); bytes += sizes[i]
  })
  if (cur.length) chunks.push(cur)
  return chunks
}

/** Worker pool dengan fail-fast: error pertama menghentikan antrian. */
async function pool<T>(list: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  let failed: unknown = null
  const run = async () => {
    while (failed === null && next < list.length) {
      const item = list[next++]
      try { await worker(item) } catch (e) { failed = failed ?? e }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, list.length)) }, run))
  if (failed !== null) throw failed
}
