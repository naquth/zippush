import type { GitHubConfig, TreeItem } from '@/types'

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

const MAX_WAIT_MS = 120_000
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

const encodeBranch = (b: string) => b.split('/').map(encodeURIComponent).join('/')

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

  constructor(config: GitHubConfig, opts: ClientOptions = {}) {
    const owner = encodeURIComponent(config.owner.trim())
    const repo = encodeURIComponent(config.repo.trim())
    this.base = `https://api.github.com/repos/${owner}/${repo}`
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

  private async request<T>(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<T> {
    const url = `${this.base}${path}`
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
        })
        text = await res.text() // timer tetap aktif sampai body selesai dibaca
      } catch (e) {
        clearTimeout(timer)
        const reason = ctrl.signal.aborted ? `timeout ${Math.round(this.timeoutMs / 1000)}s` : 'network error'
        if (attempt >= this.maxRetries) {
          throw new GitHubError(`Request failed (${reason}) after ${attempt + 1} attempts: ${method} ${path}`)
        }
        const delay = backoff(attempt)
        this.onRetry?.(`${reason} — retry ${attempt + 1}/${this.maxRetries} in ${Math.round(delay / 1000)}s`)
        await this.sleep(delay)
        continue
      }
      clearTimeout(timer)

      let json: any = null
      try { json = text ? JSON.parse(text) : null } catch { /* body bukan JSON */ }
      if (res.ok) return json as T

      const msg: string = json?.message ?? `HTTP ${res.status}`
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
          throw new GitHubError(
            `GitHub rate limit reached — try again in ${Math.ceil(delay / 60_000)} min.`,
            res.status
          )
        }
        if (attempt >= this.maxRetries) throw new GitHubError(friendly(res.status, msg), res.status)
        if (rateLimited) this.pauseUntil = Math.max(this.pauseUntil, Date.now() + delay)
        this.onRetry?.(
          `${rateLimited ? 'rate limited' : `HTTP ${res.status}`} — waiting ${Math.round(delay / 1000)}s, retry ${attempt + 1}/${this.maxRetries}`
        )
        await this.sleep(delay)
        continue
      }

      throw new GitHubError(friendly(res.status, msg), res.status)
    }
  }

  // ───────────────────────── git data API ─────────────────────────

  async getBranchHead(branch: string): Promise<string> {
    const d = await this.request<any>('GET', `/git/ref/heads/${encodeBranch(branch)}`)
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
    await this.request('PATCH', `/git/refs/heads/${encodeBranch(branch)}`, { sha, force: false })
  }
}

function backoff(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 15_000) + Math.floor(Math.random() * 400)
}

function friendly(status: number, msg: string): string {
  switch (status) {
    case 401: return 'Token invalid or expired (401). Generate a new Personal Access Token.'
    case 403: return `Access denied (403): ${msg}. Token needs "repo" scope (plus "workflow" if the ZIP touches .github/workflows).`
    case 404: return 'Repo or branch not found (404) — or the token has no access to this repo. Check owner/repo/branch.'
    case 409: return `Conflict (409): ${msg}. If the repository is empty, create an initial commit first (e.g. a README).`
    case 422: return `Rejected by GitHub (422): ${msg}`
    default: return `${msg} (${status})`
  }
}
