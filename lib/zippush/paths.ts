import type { ExtractedFile, PushEntry } from './types'

const JUNK = [
  /^__MACOSX\//,
  /(^|\/)\.DS_Store$/,
  /(^|\/)Thumbs\.db$/i,
  /(^|\/)desktop\.ini$/i,
]

/** Normalisasi path ZIP/folder → path repo. Mengembalikan null jika harus dibuang. */
export function normalizePath(raw: string): string | null {
  let p = raw.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^(\.\/)+/, '').replace(/^\/+/, '')
  if (!p || p.endsWith('/')) return null
  if (/[\u0000-\u001f]/.test(p)) return null
  const segs = p.split('/').filter((s) => s !== '.')
  if (segs.length === 0) return null
  if (segs.some((s) => s === '..')) return null // path traversal
  if (segs.some((s) => s.toLowerCase() === '.git')) return null // GitHub menolak .git di tree
  p = segs.join('/')
  if (JUNK.some((r) => r.test(p))) return null
  return p
}

/** Normalisasi folder tujuan ("/assets//img/" → "assets/img"). Melempar error jika tidak aman. */
export function normalizeFolder(raw: string): string {
  const segs = raw.replace(/\\/g, '/').split('/').map((s) => s.trim()).filter((s) => s && s !== '.')
  if (segs.some((s) => s === '..' || s.toLowerCase() === '.git' || /[\u0000-\u001f]/.test(s))) {
    throw new Error('Target folder tidak valid (tidak boleh berisi "..", ".git", atau karakter kontrol).')
  }
  return segs.join('/')
}

/** Folder root tunggal yang membungkus semua file, atau null. */
export function detectStripRoot(paths: string[]): string | null {
  if (!paths.length) return null
  const first = paths[0].split('/')[0]
  if (first && paths.every((p) => p.startsWith(first + '/'))) return first
  return null
}

export interface PrepareOptions {
  /** nama folder yang dibuang secara manual (menang atas auto) */
  stripRoot?: string
  /** deteksi otomatis folder pembungkus tunggal (default true) */
  autoStrip?: boolean
  /** folder tujuan di repo (default root) */
  prefix?: string
}

export function prepareEntries(
  files: ExtractedFile[],
  opts: PrepareOptions = {}
): { entries: PushEntry[]; skipped: number; stripRoot: string; prefix: string } {
  const prefix = normalizeFolder(opts.prefix ?? '')
  let skipped = 0
  const cleaned: { srcIndex: number; path: string; f: ExtractedFile }[] = []

  files.forEach((f, srcIndex) => {
    const path = normalizePath(f.path)
    if (path === null) skipped++
    else cleaned.push({ srcIndex, path, f })
  })

  // Deteksi root SETELAH junk (__MACOSX dll.) dibuang, kalau tidak auto-detect gagal di ZIP buatan Mac.
  const manual = (opts.stripRoot ?? '').trim().replace(/^\/+|\/+$/g, '')
  const stripRoot = manual || (opts.autoStrip === false ? '' : detectStripRoot(cleaned.map((c) => c.path)) || '')

  const byPath = new Map<string, PushEntry>()
  for (const c of cleaned) {
    let path = c.path
    if (stripRoot && path.startsWith(stripRoot + '/')) path = path.slice(stripRoot.length + 1)
    if (!path) { skipped++; continue }
    if (prefix) path = `${prefix}/${path}`
    if (byPath.has(path)) skipped++ // duplikat: yang terakhir menang
    byPath.set(path, {
      srcIndex: c.srcIndex,
      path,
      data: c.f.data,
      mode: c.f.executable ? '100755' : '100644',
    })
  }

  const entries = [...byPath.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  return { entries, skipped, stripRoot, prefix }
}

/** Template pesan commit: {filename} {count} {date}. */
export function formatCommitMessage(template: string, paths: string[]): string {
  const tpl = (template || '').trim() || 'Upload {filename}'
  const name = paths.length === 1 ? paths[0].split('/').pop()! : `${paths.length} files`
  const date = new Date().toISOString().slice(0, 10)
  return tpl
    .split('{filename}').join(name)
    .split('{count}').join(String(paths.length))
    .split('{date}').join(date)
    .slice(0, 500)
}
