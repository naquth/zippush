import type { TreeItem } from './types'

export class GitHubError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'GitHubError'
    this.status = status
  }
}

export interface RemoteBlob {
  sha: string
  mode: string
}

/** Kontrak yang dipakai engine — memudahkan pengujian dengan GitHub palsu. */
export interface GitHubApi {
  readonly requestCount: number
  getBranchHead(branch: string): Promise<string>
  getCommitTree(commitSha: string): Promise<string>
  getTreeBlobs(treeSha: string): Promise<{ blobs: Map<string, RemoteBlob>; truncated: boolean }>
  createBlob(base64: string): Promise<string>
  createTree(baseTreeSha: string, items: TreeItem[]): Promise<string>
  createCommit(message: string, treeSha: string, parentSha: string): Promise<string>
  updateRef(branch: string, sha: string): Promise<void>
}

export interface ClientOptions {
  timeoutMs?: number
  maxRetries?: number
  /** dipanggil saat request di-retry / menunggu rate-limit */
  onRetry?: (message: string) => void
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}

export interface ClientConfig {
  token: string
  owner?: string
  repo?: string
}

export interface GitHubUser {
  login: string
  name?: string | null
  avatar_url?: string
}

export interface GitHubRepo {
  id: number
  name: string
  full_name: string
  private: boolean
  description: string | null
  html_url: string
  default_branch: string
  language: string | null
  stargazers_count: number
  forks_count: number
  owner: { login: string }
  permissions?: { admin?: boolean; push?: boolean }
}

export interface ContentItem {
  name: string
  path: string
  sha: string
  size: number
  type: 'file' | 'dir' | 'symlink' | 'submodule'
  download_url: string | null
  html_url: string
}

const API = 'https://api.github.com'
const MAX_WAIT_MS = 120_000
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Encode tiap segmen path (spasi, #, ?, % aman) tetapi pertahankan "/". */
export const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/')

export class GitHubClient implements GitHubApi {
  requestCount = 0
  private base: string
  private headers: Record<string, string>
  private timeoutMs: number
  private maxRetries: number
  private onRetry?: (m: string) => void
  private fetchImpl: typeof fetch
  private sleep: (ms: number) => Promise<void>
  /** Jeda bersama: kalau kena rate-limit, SEMUA worker paralel ikut menunggu. */
  private pauseUntil = 0

  constructor(config: ClientConfig, opts: ClientOptions = {}) {
    const owner = encodeURIComponent((config.owner ?? '').trim())
    const repo = encodeURIComponent((config.repo ?? '').trim())
    this.base = `${API}/repos/${owner}/${repo}`
    this.headers = {
      Authorization: `Bearer ${config.token.trim()}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    }
    this.timeoutMs = opts.timeoutMs ?? 30_000
    this.maxRetries = opts.maxRetries ?? 5
    this.onRetry = opts.onRetry
    this.fetchImpl = opts.fetchImpl ?? ((...a) => fetch(...a))
    this.sleep = opts.sleep ?? defaultSleep
  }

  // ───────────────────────── core request ─────────────────────────

  private async send(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    body?: unknown
  ): Promise<{ json: any; headers: Headers }> {
    for (let attempt = 0; ; attempt++) {
      const wait = this.pauseUntil - Date.now()
      if (wait > 0) await this.sleep(wait)

      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), this.timeoutMs)
      let res: Response
      let text: string
      try {
        this.requestCount++
        res = await this.fetchImpl(url, {
          method,
          headers: body === undefined ? this.headers : { ...this.headers, 'Content-Type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: ctrl.signal,
          cache: 'no-store',
        })
        text = await res.text() // timer tetap aktif sampai body selesai dibaca
      } catch {
        clearTimeout(timer)
        const reason = ctrl.signal.aborted ? `timeout ${Math.round(this.timeoutMs / 1000)}s` : 'network error'
        if (attempt >= this.maxRetries) {
          throw new GitHubError(`Request gagal (${reason}) setelah ${attempt + 1} percobaan: ${method} ${new URL(url).pathname}`)
        }
        const delay = backoff(attempt)
        this.onRetry?.(`${reason} — coba lagi ${attempt + 1}/${this.maxRetries} dalam ${Math.round(delay / 1000)}s`)
        await this.sleep(delay)
        continue
      }
      clearTimeout(timer)

      let json: any = null
      try { json = text ? JSON.parse(text) : null } catch { /* body bukan JSON */ }
      if (res.ok) return { json, headers: res.headers }

      const detail = Array.isArray(json?.errors)
        ? json.errors.map((e: any) => e?.message ?? e?.code).filter(Boolean).join('; ')
        : ''
      const msg: string = (json?.message ?? `HTTP ${res.status}`) + (detail ? `: ${detail}` : '')
      const retryAfter = Number(res.headers.get('retry-after'))
      const remaining = res.headers.get('x-ratelimit-remaining')
      const reset = Number(res.headers.get('x-ratelimit-reset'))
      const rateLimited =
        res.status === 429 ||
        (res.status === 403 && (retryAfter > 0 || remaining === '0' || /rate limit|abuse|secondary/i.test(msg)))

      if (rateLimited || res.status >= 500 || res.status === 408) {
        let delay = backoff(attempt)
        if (rateLimited) {
          if (retryAfter > 0) delay = retryAfter * 1000
          else if (remaining === '0' && reset > 0) delay = Math.max(reset * 1000 - Date.now(), 1000)
          else delay = Math.max(delay, 60_000) // secondary limit tanpa header: tunggu ±1 menit
        }
        if (delay > MAX_WAIT_MS) {
          throw new GitHubError(`Rate limit GitHub tercapai — coba lagi dalam ${Math.ceil(delay / 60_000)} menit.`, res.status)
        }
        if (attempt >= this.maxRetries) throw new GitHubError(friendly(res.status, msg), res.status)
        if (rateLimited) this.pauseUntil = Math.max(this.pauseUntil, Date.now() + delay)
        this.onRetry?.(
          `${rateLimited ? 'terkena rate limit' : `HTTP ${res.status}`} — menunggu ${Math.round(delay / 1000)}s, coba lagi ${attempt + 1}/${this.maxRetries}`
        )
        await this.sleep(delay)
        continue
      }

      throw new GitHubError(friendly(res.status, msg), res.status)
    }
  }

  private async request<T>(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<T> {
    return (await this.send(method, `${this.base}${path}`, body)).json as T
  }

  // ───────────────────────── git data API ─────────────────────────

  async getBranchHead(branch: string): Promise<string> {
    const d = await this.request<any>('GET', `/git/ref/heads/${encodePath(branch)}`)
    return d.object.sha as string
  }

  async getCommitTree(commitSha: string): Promise<string> {
    const d = await this.request<any>('GET', `/git/commits/${commitSha}`)
    return d.tree.sha as string
  }

  async getTreeBlobs(treeSha: string) {
    const d = await this.request<any>('GET', `/git/trees/${treeSha}?recursive=1`)
    const blobs = new Map<string, RemoteBlob>()
    for (const it of (d.tree ?? []) as Array<{ path: string; type: string; sha: string; mode: string }>) {
      if (it.type === 'blob') blobs.set(it.path, { sha: it.sha, mode: it.mode })
    }
    return { blobs, truncated: !!d.truncated }
  }

  async createBlob(base64: string): Promise<string> {
    const d = await this.request<any>('POST', '/git/blobs', { content: base64, encoding: 'base64' })
    return d.sha as string
  }

  async createTree(baseTreeSha: string, items: TreeItem[]): Promise<string> {
    const d = await this.request<any>('POST', '/git/trees', { base_tree: baseTreeSha, tree: items })
    return d.sha as string
  }

  async createCommit(message: string, treeSha: string, parentSha: string): Promise<string> {
    const d = await this.request<any>('POST', '/git/commits', { message, tree: treeSha, parents: [parentSha] })
    return d.sha as string
  }

  async updateRef(branch: string, sha: string): Promise<void> {
    await this.request('PATCH', `/git/refs/heads/${encodePath(branch)}`, { sha, force: false })
  }

  // ───────────────────────── akun / repo / contents ─────────────────────────

  /** User yang sedang login + scope token (header X-OAuth-Scopes, hanya ada untuk token classic). */
  async getUser(): Promise<{ user: GitHubUser; scopes: string[] | null }> {
    const { json, headers } = await this.send('GET', `${API}/user`)
    const s = headers.get('x-oauth-scopes')
    return { user: json as GitHubUser, scopes: s === null ? null : s.split(',').map((x) => x.trim()).filter(Boolean) }
  }

  private async paginate<T>(path: string, maxPages = 10): Promise<T[]> {
    const out: T[] = []
    const sep = path.includes('?') ? '&' : '?'
    for (let page = 1; page <= maxPages; page++) {
      const { json } = await this.send('GET', `${API}${path}${sep}per_page=100&page=${page}`)
      const arr = Array.isArray(json) ? (json as T[]) : []
      out.push(...arr)
      if (arr.length < 100) break
    }
    return out
  }

  /** Semua repo yang bisa diakses token (termasuk PRIVAT, org, dan kolaborasi). */
  listRepos(): Promise<GitHubRepo[]> {
    return this.paginate<GitHubRepo>('/user/repos?sort=updated&affiliation=owner,collaborator,organization_member')
  }

  async listBranches(): Promise<string[]> {
    const b = await this.paginate<{ name: string }>(`${this.base.slice(API.length)}/branches`)
    return b.map((x) => x.name)
  }

  async listContents(path: string, ref: string): Promise<ContentItem[]> {
    const p = path ? `/${encodePath(path)}` : ''
    const { json } = await this.send('GET', `${this.base}/contents${p}?ref=${encodeURIComponent(ref)}`)
    return Array.isArray(json) ? json : [json]
  }

  async createRepo(name: string, description: string, isPrivate: boolean): Promise<GitHubRepo> {
    const { json } = await this.send('POST', `${API}/user/repos`, {
      name, description, private: isPrivate, auto_init: true,
    })
    return json as GitHubRepo
  }

  async deleteRepo(owner: string, name: string): Promise<void> {
    await this.send('DELETE', `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`)
  }
}

function backoff(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 15_000) + Math.floor(Math.random() * 400)
}

function friendly(status: number, msg: string): string {
  switch (status) {
    case 401: return 'Token tidak valid atau kedaluwarsa (401). Buat Personal Access Token baru.'
    case 403: return `Akses ditolak (403): ${msg}. Token butuh scope "repo" (plus "workflow" jika ZIP menyentuh .github/workflows).`
    case 404: return 'Repo/branch tidak ditemukan (404) — atau token tidak punya akses. Periksa owner/repo/branch.'
    case 409: return `Konflik (409): ${msg}. Jika repo masih kosong, buat commit awal dulu (mis. README).`
    case 422: return `Ditolak GitHub (422): ${msg}`
    default: return `${msg} (${status})`
  }
}
