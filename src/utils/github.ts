import type { GitHubConfig, TreeItem } from '@/types'
import { encodeContent } from '@/utils'

export class GitHubService {
  private baseUrl: string
  private headers: Record<string, string>

  constructor(config: GitHubConfig) {
    this.baseUrl = `https://api.github.com/repos/${config.owner}/${config.repo}`
    this.headers = {
      Authorization: `token ${config.token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    }
  }

  async getBranchSha(branch: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/git/ref/heads/${branch}`, {
      headers: this.headers,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(
        err.message ?? `Branch "${branch}" not found (${res.status})`
      )
    }
    const data = await res.json()
    return data.object.sha as string
  }

  async getBaseTreeSha(commitSha: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/git/commits/${commitSha}`, {
      headers: this.headers,
    })
    if (!res.ok) throw new Error(`Failed to fetch commit ${commitSha}`)
    const data = await res.json()
    return data.tree.sha as string
  }

  /**
   * Mengambil semua path file (blob) yang ada di repo secara rekursif,
   * dipakai untuk fitur "hapus semua file lama sebelum push".
   */
  async getAllFilePaths(treeSha: string): Promise<string[]> {
    const res = await fetch(
      `${this.baseUrl}/git/trees/${treeSha}?recursive=1`,
      { headers: this.headers }
    )
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.message ?? 'Failed to fetch repository tree')
    }
    const data = await res.json()
    const tree: Array<{ path: string; type: string }> = data.tree ?? []
    return tree.filter((item) => item.type === 'blob').map((item) => item.path)
  }

  async createBlob(data: Uint8Array): Promise<string> {
    const { content, encoding } = encodeContent(data)
    const res = await fetch(`${this.baseUrl}/git/blobs`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ content, encoding }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.message ?? 'Failed to create blob')
    }
    const blob = await res.json()
    return blob.sha as string
  }

  async createTree(baseTreeSha: string, items: TreeItem[]): Promise<string> {
    const res = await fetch(`${this.baseUrl}/git/trees`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ base_tree: baseTreeSha, tree: items }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.message ?? 'Failed to create tree')
    }
    const tree = await res.json()
    return tree.sha as string
  }

  async createCommit(
    message: string,
    treeSha: string,
    parentSha: string
  ): Promise<{ sha: string }> {
    const res = await fetch(`${this.baseUrl}/git/commits`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ message, tree: treeSha, parents: [parentSha] }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.message ?? 'Failed to create commit')
    }
    return res.json()
  }

  async updateRef(branch: string, sha: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      headers: this.headers,
      body: JSON.stringify({ sha }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.message ?? 'Failed to update branch ref')
    }
  }
}
