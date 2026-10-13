import type { GitHubApi, RemoteBlob } from '../src/utils/github'
import type { TreeItem } from '../src/types'
import { gitBlobSha } from '../src/utils/encoding'

type Tree = Map<string, RemoteBlob>

/** GitHub palsu in-memory dengan semantik Git yang sama (sha asli, penolakan path duplikat/konflik). */
export class FakeGitHub implements GitHubApi {
  requestCount = 0
  calls: Record<string, number> = {}
  blobs = new Map<string, Uint8Array>()
  trees = new Map<string, Tree>()
  commits = new Map<string, { tree: string; parent: string | null; message: string }>()
  refs = new Map<string, string>()
  inflight = 0
  maxInflight = 0
  failBlobAfter = Infinity
  private n = 0

  private hit(name: string) { this.requestCount++; this.calls[name] = (this.calls[name] ?? 0) + 1 }

  async seed(branch: string, files: Record<string, string | Uint8Array>, mode = '100644') {
    const tree: Tree = new Map()
    for (const [p, c] of Object.entries(files)) {
      const data = typeof c === 'string' ? new TextEncoder().encode(c) : c
      const sha = (await gitBlobSha(data))!
      this.blobs.set(sha, data)
      tree.set(p, { sha, mode })
    }
    const tsha = `tree${++this.n}`
    this.trees.set(tsha, tree)
    const csha = `commit${++this.n}`
    this.commits.set(csha, { tree: tsha, parent: null, message: 'seed' })
    this.refs.set(branch, csha)
    return csha
  }

  async getBranchHead(b: string) { this.hit('ref'); const s = this.refs.get(b); if (!s) throw new Error('not found'); return s }
  async getCommitTree(c: string) { this.hit('commit'); return this.commits.get(c)!.tree }
  async getTreeBlobs(t: string) { this.hit('getTree'); return { blobs: new Map(this.trees.get(t)!), truncated: false } }

  async createBlob(b64: string) {
    this.hit('blob')
    this.inflight++; this.maxInflight = Math.max(this.maxInflight, this.inflight)
    await new Promise((r) => setTimeout(r, 5))
    this.inflight--
    if ((this.calls['blob'] ?? 0) > this.failBlobAfter) throw new Error('boom')
    const data = new Uint8Array(Buffer.from(b64, 'base64'))
    const sha = (await gitBlobSha(data))!
    this.blobs.set(sha, data)
    return sha
  }

  async createTree(base: string, items: TreeItem[]) {
    this.hit('createTree')
    const tree: Tree = new Map(this.trees.get(base)!)
    const seen = new Set<string>()
    for (const it of items) {
      if (seen.has(it.path)) throw new Error(`duplicate path ${it.path}`)
      seen.add(it.path)
      if (it.sha === null) { tree.delete(it.path); continue }
      if (it.content !== undefined) {
        const data = new TextEncoder().encode(it.content)
        const sha = (await gitBlobSha(data))!
        this.blobs.set(sha, data)
        tree.set(it.path, { sha, mode: it.mode })
      } else {
        if (!it.sha || !this.blobs.has(it.sha)) throw new Error(`missing blob for ${it.path}`)
        tree.set(it.path, { sha: it.sha, mode: it.mode })
      }
    }
    const paths = [...tree.keys()]
    for (const p of paths) for (const q of paths) if (q.startsWith(p + '/')) throw new Error(`file/dir conflict: ${p} vs ${q}`)
    const sha = `tree${++this.n}`
    this.trees.set(sha, tree)
    return sha
  }

  async createCommit(message: string, tree: string, parent: string) {
    this.hit('createCommit')
    const sha = `commit${++this.n}`
    this.commits.set(sha, { tree, parent, message })
    return sha
  }

  async updateRef(branch: string, sha: string) { this.hit('updateRef'); this.refs.set(branch, sha) }

  /** isi repo di HEAD branch sebagai path → bytes */
  head(branch: string) {
    const tree = this.trees.get(this.commits.get(this.refs.get(branch)!)!.tree)!
    return new Map([...tree].map(([p, b]) => [p, { data: this.blobs.get(b.sha)!, mode: b.mode }]))
  }
}
