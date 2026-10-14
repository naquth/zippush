import type { ChangeSet, LogType, PushEntry, PushSummary, TreeItem } from './types'
import type { GitHubApi } from './github'
import { gitBlobSha, toBase64, tryDecodeText } from './encoding'

export interface EngineOptions {
  branch: string
  commitMessage: string
  entries: PushEntry[]
  /** mirror: hapus file di repo yang tidak ada di ZIP */
  clearRepo: boolean
  /** batasi penghapusan mirror ke folder ini (kosong = seluruh repo) */
  scopePrefix?: string
  skipped: number
  /** hanya hitung perubahan, tidak menulis apa pun ke GitHub */
  dryRun?: boolean
  /** jumlah upload blob paralel (default 6) */
  concurrency?: number
}

export interface EngineCallbacks {
  log: (type: LogType, message: string) => void
  progress: (pct: number) => void
  /** file (srcIndex) sudah beres / sudah sinkron */
  fileDone: (srcIndex: number) => void
}

export interface EngineResult {
  commitSha?: string
  summary: PushSummary
  changes: ChangeSet
}

const TREE_CHUNK_ENTRIES = 250
const TREE_CHUNK_BYTES = 2 * 1024 * 1024
const MAX_FILE_BYTES = 100 * 1024 * 1024 // batas blob GitHub API
const LOG_FILE_LINES = 150
const ANCHOR = '.naquth-tmp-anchor'

type Plan = { entry: PushEntry; sha: string | null; mode: string; kind: 'added' | 'modified' }

/**
 * Alur (idempoten; tidak ada yang terlihat di repo sampai langkah terakhir):
 *  1. baca HEAD + tree repo (3 request)
 *  2. hitung SHA Git tiap file lokal & bandingkan → HANYA yang berubah yang dikirim
 *  3. file teks → inline di tree (0 request tambahan); biner → blob paralel (concurrency terbatas)
 *  4. tree dibuat berantai per-chunk, 1 commit, 1 update ref  ⇒ hasil akhir atomik
 */
export async function runPush(gh: GitHubApi, opts: EngineOptions, cb: EngineCallbacks): Promise<EngineResult> {
  const { branch, entries, clearRepo } = opts
  const summary: PushSummary = { added: 0, modified: 0, unchanged: 0, deleted: 0, skipped: opts.skipped, requests: 0 }
  const changes: ChangeSet = { added: [], modified: [], deleted: [] }
  const finish = (commitSha?: string): EngineResult => {
    summary.requests = gh.requestCount
    return { commitSha, summary, changes }
  }

  if (!entries.length) throw new Error('ZIP tidak berisi file yang bisa di-push (semuanya tersaring).')
  const tooBig = entries.find((e) => e.data.byteLength > MAX_FILE_BYTES)
  if (tooBig) throw new Error(`"${tooBig.path}" melebihi batas 100 MB per file GitHub.`)

  // ── 1. state repo ──────────────────────────────────────────────
  cb.log('info', `Membaca branch: ${branch}`)
  const headSha = await gh.getBranchHead(branch)
  cb.log('ok', `Branch SHA: ${headSha.slice(0, 7)}`)
  cb.progress(5)
  const baseTreeSha = await gh.getCommitTree(headSha)
  const { blobs: remote, truncated } = await gh.getTreeBlobs(baseTreeSha)
  cb.log('ok', `Repo berisi ${remote.size} file`)
  cb.progress(12)

  if (truncated) {
    if (clearRepo) throw new Error('Tree repo terlalu besar untuk didaftar lengkap — mode "hapus file lama" dibatalkan demi keamanan.')
    cb.log('warn', 'Tree repo dipotong GitHub — deteksi perubahan parsial (file yang sama bisa terkirim ulang).')
  }

  // ── 2. diff lokal vs remote ────────────────────────────────────
  cb.log('info', `Membandingkan ${entries.length} file dengan repo…`)
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
  const scope = opts.scopePrefix ? opts.scopePrefix.replace(/\/+$/, '') + '/' : ''
  const mirrorDel = new Set<string>() // mirror: file lama yang tidak ada di antrean
  const conflictDel = new Set<string>() // konflik file↔folder: harus hilang SEBELUM penambahan
  if (clearRepo) for (const p of remote.keys()) if (!newPaths.has(p) && (!scope || p.startsWith(scope))) mirrorDel.add(p)

  // konflik file↔folder: "a" (file) vs "a/b"; kalau tidak dibereskan GitHub menolak tree-nya
  const remoteDirs = new Map<string, string[]>()
  for (const p of remote.keys()) {
    const segs = p.split('/')
    for (let i = 1; i < segs.length; i++) {
      const d = segs.slice(0, i).join('/')
      const arr = remoteDirs.get(d)
      if (arr) arr.push(p)
      else remoteDirs.set(d, [p])
    }
  }
  for (const e of entries) {
    const segs = e.path.split('/')
    for (let i = 1; i < segs.length; i++) {
      const parent = segs.slice(0, i).join('/')
      if (remote.has(parent) && !newPaths.has(parent)) conflictDel.add(parent)
    }
    for (const child of remoteDirs.get(e.path) ?? []) if (!newPaths.has(child)) conflictDel.add(child)
  }
  for (const p of conflictDel) mirrorDel.delete(p)
  const deletions = new Set([...conflictDel, ...mirrorDel])
  summary.deleted = deletions.size
  summary.added = plans.filter((p) => p.kind === 'added').length
  summary.modified = plans.length - summary.added
  changes.added = plans.filter((p) => p.kind === 'added').map((p) => p.entry.path)
  changes.modified = plans.filter((p) => p.kind === 'modified').map((p) => p.entry.path)
  changes.deleted = [...deletions].sort()

  if (!plans.length && !deletions.size) {
    cb.log('ok', `Tidak ada yang perlu di-push — repo sudah sama dengan isi ZIP (${summary.unchanged} file identik).`)
    cb.progress(100)
    return finish()
  }

  cb.log(
    'info',
    `Perubahan: +${summary.added} baru · ~${summary.modified} diubah · =${summary.unchanged} sama` +
      (summary.deleted ? ` · −${summary.deleted} dihapus` : '')
  )
  logList(cb, plans.map((p) => `${p.kind === 'added' ? '+' : '~'} ${p.entry.path}`), changes.deleted.map((p) => `− ${p}`))

  if (opts.dryRun) {
    cb.log('ok', 'Pratinjau selesai — belum ada yang ditulis ke GitHub.')
    cb.progress(100)
    return finish()
  }

  // ── 4. siapkan item tree: teks inline, biner → blob paralel ────
  const items: TreeItem[] = []
  const inlineBytes: number[] = []
  const conflictItems: TreeItem[] = []
  const mirrorItems: TreeItem[] = []
  const needBlob: Plan[] = []
  for (const p of plans) {
    const text = tryDecodeText(p.entry.data)
    if (text !== null) {
      items.push({ path: p.entry.path, mode: p.mode, type: 'blob', content: text })
      inlineBytes.push(p.entry.data.byteLength)
    } else needBlob.push(p)
  }
  for (const path of conflictDel) conflictItems.push({ path, mode: '100644', type: 'blob', sha: null })
  for (const path of mirrorDel) mirrorItems.push({ path, mode: '100644', type: 'blob', sha: null })
  cb.log('info', `${items.length} file teks inline · ${needBlob.length} biner/lainnya sebagai blob`)

  if (needBlob.length) {
    let done = 0
    await pool(needBlob, opts.concurrency ?? 6, async (p) => {
      const sha = await gh.createBlob(toBase64(p.entry.data))
      items.push({ path: p.entry.path, mode: p.mode, type: 'blob', sha })
      inlineBytes.push(64)
      done++
      cb.progress(25 + Math.round((done / needBlob.length) * 50))
    })
    cb.log('ok', `Mengunggah ${needBlob.length} blob (paralel ×${Math.min(opts.concurrency ?? 6, needBlob.length)})`)
  }
  cb.progress(78)

  // ── 5. tree berantai → commit → ref ────────────────────────────
  // Urutan chain: konflik → penambahan → penghapusan mirror.
  // GitHub TIDAK menyimpan pohon kosong hasil createTree: memakainya sebagai base_tree = 404.
  // Penghapusan massal ditaruh TERAKHIR sehingga pohon perantara selalu berisi file.
  const chunks = [
    ...chunkItems(conflictItems, conflictItems.map((d) => d.path.length)),
    ...chunkItems(items, inlineBytes),
    ...chunkItems(mirrorItems, mirrorItems.map((d) => d.path.length)),
  ]
  // Kasus langka: SEMUA file lama harus dihapus karena konflik → jangkar sementara agar pohon tidak kosong.
  if (conflictDel.size > 0 && conflictDel.size >= remote.size && chunks.length > 1) {
    chunks[0].push({ path: ANCHOR, mode: '100644', type: 'blob', content: '.' })
    chunks[chunks.length - 1].push({ path: ANCHOR, mode: '100644', type: 'blob', sha: null })
  }
  cb.log('info', `Membuat tree (${chunks.length} request)…`)
  let treeSha = baseTreeSha
  for (let i = 0; i < chunks.length; i++) {
    treeSha = await gh.createTree(treeSha, chunks[i])
    cb.progress(78 + Math.round(((i + 1) / chunks.length) * 12))
  }
  cb.log('ok', `Tree: ${treeSha.slice(0, 7)}`)
  for (const p of plans) cb.fileDone(p.entry.srcIndex)

  cb.log('info', 'Membuat commit…')
  const commitSha = await gh.createCommit(opts.commitMessage, treeSha, headSha)
  cb.log('ok', `Commit: ${commitSha.slice(0, 7)}`)
  cb.progress(95)

  cb.log('info', `Memperbarui ${branch}…`)
  await moveRef(gh, branch, commitSha)
  cb.progress(100)
  return finish(commitSha)
}

export interface DeleteOptions {
  branch: string
  /** file atau folder (folder dihapus beserta seluruh isinya) */
  paths: string[]
  message: string
}

/** Hapus file/folder dari repo dalam SATU commit (bukan satu commit per file). */
export async function runDelete(
  gh: GitHubApi,
  opts: DeleteOptions,
  cb: Pick<EngineCallbacks, 'log' | 'progress'>
): Promise<{ commitSha: string; deleted: number }> {
  cb.log('info', `Membaca branch: ${opts.branch}`)
  const headSha = await gh.getBranchHead(opts.branch)
  const baseTreeSha = await gh.getCommitTree(headSha)
  const { blobs, truncated } = await gh.getTreeBlobs(baseTreeSha)
  if (truncated) throw new Error('Tree repo terlalu besar untuk dihapus dengan aman dari sini.')
  cb.progress(30)

  const targets = new Set<string>()
  for (const raw of opts.paths) {
    const p = raw.replace(/^\/+|\/+$/g, '')
    if (!p) continue
    if (blobs.has(p)) targets.add(p)
    for (const k of blobs.keys()) if (k.startsWith(p + '/')) targets.add(k)
  }
  if (!targets.size) throw new Error('Tidak ada file yang cocok untuk dihapus (mungkin sudah terhapus).')
  if (targets.size >= blobs.size) throw new Error('Tidak bisa mengosongkan repo sepenuhnya lewat API — sisakan minimal satu file (mis. README).')

  const items: TreeItem[] = [...targets].map((path) => ({ path, mode: '100644', type: 'blob', sha: null }))
  let treeSha = baseTreeSha
  for (const chunk of chunkItems(items, items.map((i) => i.path.length))) treeSha = await gh.createTree(treeSha, chunk)
  cb.progress(70)
  const commitSha = await gh.createCommit(opts.message, treeSha, headSha)
  await moveRef(gh, opts.branch, commitSha)
  cb.progress(100)
  cb.log('ok', `Dihapus ${targets.size} file dalam 1 commit (${commitSha.slice(0, 7)})`)
  return { commitSha, deleted: targets.size }
}

// ───────────────────────── helpers ─────────────────────────

async function moveRef(gh: GitHubApi, branch: string, sha: string) {
  try {
    await gh.updateRef(branch, sha)
  } catch (e) {
    const m = e instanceof Error ? e.message : ''
    if (/fast.?forward|422/i.test(m)) {
      throw new Error(`Branch "${branch}" berubah di GitHub saat proses berjalan (ada push lain). Tidak ada yang tertimpa — coba lagi.`)
    }
    throw e
  }
}

function logList(cb: EngineCallbacks, files: string[], dels: string[]) {
  const all = [...files, ...dels]
  all.slice(0, LOG_FILE_LINES).forEach((l) => cb.log('plain', `  ${l}`))
  if (all.length > LOG_FILE_LINES) cb.log('plain', `  …dan ${all.length - LOG_FILE_LINES} lainnya`)
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
