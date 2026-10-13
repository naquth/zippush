import { describe, it, expect } from 'vitest'
import { createHash, randomBytes } from 'node:crypto'
import { FakeGitHub } from './fakeGithub'
import { runPush, runDelete } from '../lib/zippush/engine'
import { prepareEntries, normalizePath, normalizeFolder, formatCommitMessage } from '../lib/zippush/paths'
import { gitBlobSha, toBase64, tryDecodeText } from '../lib/zippush/encoding'
import { GitHubClient, encodePath } from '../lib/zippush/github'
import type { ExtractedFile } from '../lib/zippush/types'

const enc = (s: string) => new TextEncoder().encode(s)
const f = (path: string, c: string | Uint8Array, executable = false): ExtractedFile =>
  ({ path, data: typeof c === 'string' ? enc(c) : c, executable })
const noop = { log: () => {}, progress: () => {}, fileDone: () => {} }
const run = (gh: FakeGitHub, files: ExtractedFile[], extra: any = {}, prep: any = {}) => {
  const { entries, skipped } = prepareEntries(files, prep)
  const done: number[] = []
  return runPush(gh, { branch: 'main', commitMessage: 'm', entries, clearRepo: false, skipped, ...extra },
    { ...noop, fileDone: (i) => done.push(i) }).then((r) => ({ ...r, done }))
}

describe('encoding', () => {
  it('gitBlobSha == git hash-object', async () => {
    expect(await gitBlobSha(enc('hello\n'))).toBe('ce013625030ba8dba906f756967f9e9ca394464a')
    expect(await gitBlobSha(new Uint8Array())).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391')
    const big = randomBytes(300_001)
    const h = createHash('sha1').update(`blob ${big.length}\0`).update(big).digest('hex')
    expect(await gitBlobSha(new Uint8Array(big))).toBe(h)
  })
  it('toBase64 == Buffer base64 (semua panjang sisa)', () => {
    for (const n of [0, 1, 2, 3, 24575, 24576, 24577, 100_003, 5_000_001]) {
      const b = randomBytes(n)
      expect(toBase64(new Uint8Array(b))).toBe(b.toString('base64'))
    }
  })
  it('tryDecodeText menolak BOM / NUL / UTF-8 invalid / kosong / besar', () => {
    expect(tryDecodeText(enc('héllo ✓\r\n'))).toBe('héllo ✓\r\n')
    expect(tryDecodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x61]))).toBeNull()
    expect(tryDecodeText(new Uint8Array([0x61, 0, 0x62]))).toBeNull()
    expect(tryDecodeText(new Uint8Array([0xff, 0xfe, 0x41]))).toBeNull()
    expect(tryDecodeText(new Uint8Array())).toBeNull()
    expect(tryDecodeText(new Uint8Array(600 * 1024).fill(97))).toBeNull()
  })
})

describe('paths', () => {
  it('ZIP buatan Mac: __MACOSX tidak merusak deteksi root', () => {
    const { entries, skipped, stripRoot } = prepareEntries([
      f('proj/a.txt', 'a'), f('proj/src/b.ts', 'b'), f('__MACOSX/proj/._a.txt', 'x'), f('proj/.DS_Store', 'x'),
    ])
    expect(stripRoot).toBe('proj')
    expect(entries.map((e) => e.path)).toEqual(['a.txt', 'src/b.ts'])
    expect(skipped).toBe(2)
  })
  it('menolak traversal, .git, backslash dinormalisasi', () => {
    expect(normalizePath('../evil')).toBeNull()
    expect(normalizePath('a/../../evil')).toBeNull()
    expect(normalizePath('.git/config')).toBeNull()
    expect(normalizePath('x/.GIT/hooks')).toBeNull()
    expect(normalizePath('/abs/p.txt')).toBe('abs/p.txt')
    expect(normalizePath('win\\dir\\f.txt')).toBe('win/dir/f.txt')
    expect(normalizePath('dir/')).toBeNull()
  })
  it('duplikat: terakhir menang; bit executable terbawa', () => {
    const { entries } = prepareEntries([f('a.sh', '1', true), f('a.sh', '2', true), f('b', 'x')])
    expect(entries.length).toBe(2)
    expect(new TextDecoder().decode(entries[0].data)).toBe('2')
    expect(entries[0].mode).toBe('100755')
  })
})

describe('engine', () => {
  it('push pertama: 1 commit, konten byte-exact (teks & biner), request minimal', async () => {
    const gh = new FakeGitHub(); await gh.seed('main', { 'README.md': 'old' })
    const bin = new Uint8Array(randomBytes(70_000))
    const odd = new Uint8Array([0x68, 0x69, 0xff, 0x0a]) // bukan UTF-8 valid → harus lewat blob
    const files = [f('README.md', 'new'), f('src/a.ts', 'x\r\ny\r\n'), f('img/p.png', bin), f('odd.txt', odd), f('bom.txt', new Uint8Array([0xef,0xbb,0xbf,0x41])), f('empty.txt', '')]
    const r = await run(gh, files)
    expect(r.commitSha).toBeTruthy()
    expect(gh.calls['createCommit']).toBe(1)
    expect(gh.calls['updateRef']).toBe(1)
    const head = gh.head('main')
    expect(Buffer.from(head.get('src/a.ts')!.data).toString()).toBe('x\r\ny\r\n')
    expect(Buffer.compare(head.get('img/p.png')!.data, bin)).toBe(0)
    expect(Buffer.compare(head.get('odd.txt')!.data, odd)).toBe(0)
    expect(head.get('bom.txt')!.data[0]).toBe(0xef)
    expect(head.get('empty.txt')!.data.length).toBe(0)
    expect(r.summary).toMatchObject({ added: 5, modified: 1, unchanged: 0, deleted: 0 })
    expect(gh.calls['blob']).toBe(4) // png, odd, bom, empty → hanya ini yang butuh blob
  })

  it('re-push ZIP yang sama = tidak ada commit, tidak ada upload', async () => {
    const gh = new FakeGitHub(); await gh.seed('main', {})
    const files = [f('a.txt', 'A'), f('b.bin', new Uint8Array(randomBytes(1000)))]
    await run(gh, files)
    const before = { ...gh.calls }
    const r = await run(gh, files)
    expect(r.commitSha).toBeUndefined()
    expect(r.summary.unchanged).toBe(2)
    expect(gh.calls['createCommit']).toBe(before['createCommit'])
    expect(gh.calls['blob']).toBe(before['blob'])
    expect(r.done.sort()).toEqual([0, 1]) // UI tetap menandai file sinkron
  })

  it('hanya file berubah yang dikirim; mode executable lama dipertahankan', async () => {
    const gh = new FakeGitHub(); await gh.seed('main', { 'run.sh': 'echo 1', 'same.txt': 'same' }, '100755')
    const r = await run(gh, [f('run.sh', 'echo 2'), f('same.txt', 'same')])
    expect(r.summary).toMatchObject({ modified: 1, unchanged: 1, added: 0 })
    expect(gh.head('main').get('run.sh')!.mode).toBe('100755')
  })

  it('clearRepo menghapus file lama tanpa path duplikat di tree', async () => {
    const gh = new FakeGitHub(); await gh.seed('main', { 'old1.txt': '1', 'dir/old2.txt': '2', 'keep.txt': 'k' })
    const r = await run(gh, [f('keep.txt', 'k2'), f('new.txt', 'n')], { clearRepo: true })
    expect([...gh.head('main').keys()].sort()).toEqual(['keep.txt', 'new.txt'])
    expect(r.summary.deleted).toBe(2)
  })

  it('konflik file↔folder dibereskan otomatis (a → a/b dan sebaliknya)', async () => {
    const gh = new FakeGitHub(); await gh.seed('main', { a: 'file', 'd/x': '1', 'd/y': '2' })
    await run(gh, [f('a/b.txt', 'B'), f('d', 'now a file')])
    expect([...gh.head('main').keys()].sort()).toEqual(['a/b.txt', 'd'])
  })

  it('600 file teks → tree di-chunk, hanya 1 commit, 0 blob request', async () => {
    const gh = new FakeGitHub(); await gh.seed('main', {})
    const files = Array.from({ length: 600 }, (_, i) => f(`src/f${i}.ts`, `export const n = ${i}\n`))
    const r = await run(gh, files)
    expect(gh.calls['createTree']).toBe(3)
    expect(gh.calls['blob'] ?? 0).toBe(0)
    expect(gh.head('main').size).toBe(600)
    expect(r.summary.requests).toBeLessThan(10) // sebelumnya: 600+ request
  })

  it('upload blob paralel dibatasi concurrency', async () => {
    const gh = new FakeGitHub(); await gh.seed('main', {})
    const files = Array.from({ length: 30 }, (_, i) => f(`b${i}.bin`, new Uint8Array(randomBytes(500))))
    await run(gh, files, { concurrency: 6 })
    expect(gh.maxInflight).toBeGreaterThan(1)
    expect(gh.maxInflight).toBeLessThanOrEqual(6)
  })

  it('gagal di tengah upload → ref TIDAK berubah (atomik)', async () => {
    const gh = new FakeGitHub(); const c0 = await gh.seed('main', { 'a.txt': 'a' })
    gh.failBlobAfter = 3
    const files = Array.from({ length: 20 }, (_, i) => f(`b${i}.bin`, new Uint8Array(randomBytes(500))))
    await expect(run(gh, files)).rejects.toThrow('boom')
    expect(gh.refs.get('main')).toBe(c0)
    expect(gh.calls['createCommit'] ?? 0).toBe(0)
  })
})

describe('GitHubClient', () => {
  const mk = (responses: Array<() => Promise<Response> | Response>, sleeps: number[] = []) => {
    let i = 0
    const fetchImpl = (async () => responses[Math.min(i++, responses.length - 1)]()) as unknown as typeof fetch
    const gh = new GitHubClient({ token: ' tok ', owner: 'o', repo: 'r' },
      { fetchImpl, sleep: async (ms) => { sleeps.push(ms) }, maxRetries: 3 })
    return { gh, calls: () => i }
  }
  const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    () => new Response(JSON.stringify(body), { status, headers })

  it('429 + retry-after → menunggu lalu sukses', async () => {
    const sleeps: number[] = []
    const { gh, calls } = mk([json(429, { message: 'slow down' }, { 'retry-after': '7' }), json(200, { object: { sha: 'abc' } })], sleeps)
    expect(await gh.getBranchHead('main')).toBe('abc')
    expect(calls()).toBe(2)
    expect(sleeps).toContain(7000)
  })
  it('403 secondary rate limit tanpa header → tunggu ≥ 60s', async () => {
    const sleeps: number[] = []
    const { gh } = mk([json(403, { message: 'You have exceeded a secondary rate limit' }), json(200, { object: { sha: 'z' } })], sleeps)
    await gh.getBranchHead('main')
    expect(Math.max(...sleeps)).toBeGreaterThanOrEqual(60_000)
  })
  it('5xx & network error di-retry; 401 tidak di-retry dan pesannya jelas', async () => {
    const { gh, calls } = mk([json(502, {}), () => { throw new TypeError('fetch failed') }, json(200, { object: { sha: 'ok' } })])
    expect(await gh.getBranchHead('main')).toBe('ok')
    expect(calls()).toBe(3)
    const m2 = mk([json(401, { message: 'Bad credentials' })])
    await expect(m2.gh.getBranchHead('main')).rejects.toThrow(/Token tidak valid/)
    expect(m2.calls()).toBe(1)
  })
  it('timeout (request menggantung) di-abort lalu di-retry', async () => {
    let i = 0
    const fetchImpl = ((_u: string, init: RequestInit) => {
      if (i++ === 0) return new Promise((_r, rej) => init.signal!.addEventListener('abort', () => rej(new DOMException('a', 'AbortError'))))
      return Promise.resolve(new Response(JSON.stringify({ object: { sha: 'late' } }), { status: 200 }))
    }) as unknown as typeof fetch
    const gh = new GitHubClient({ token: 't', owner: 'o', repo: 'r' }, { fetchImpl, sleep: async () => {}, timeoutMs: 20 })
    expect(await gh.getBranchHead('main')).toBe('late')
    expect(i).toBe(2)
  })
  it('error biasa gagal setelah maxRetries dengan pesan jelas', async () => {
    const { gh, calls } = mk([() => { throw new TypeError('fetch failed') }])
    await expect(gh.getBranchHead('main')).rejects.toThrow(/setelah 4 percobaan/)
    expect(calls()).toBe(4)
  })
})

describe('fitur gabungan (Naquth)', () => {
  it('encodePath: spasi, #, ?, % aman tetapi "/" dipertahankan', () => {
    expect(encodePath('my file#1.png')).toBe('my%20file%231.png')
    expect(encodePath('a/b c/report?v2.txt')).toBe('a/b%20c/report%3Fv2.txt')
    expect(encodePath('feature/x')).toBe('feature/x')
  })
  it('normalizeFolder & prefix target folder', () => {
    expect(normalizeFolder('/assets//img/')).toBe('assets/img')
    expect(normalizeFolder('')).toBe('')
    expect(() => normalizeFolder('a/../b')).toThrow()
    expect(() => normalizeFolder('.git/x')).toThrow()
    const { entries } = prepareEntries([f('p/a.txt', '1'), f('p/s/b.txt', '2')], { prefix: 'docs/v1' })
    expect(entries.map((e) => e.path)).toEqual(['docs/v1/a.txt', 'docs/v1/s/b.txt'])
  })
  it('autoStrip:false mempertahankan folder pembungkus', () => {
    const { entries, stripRoot } = prepareEntries([f('proj/a.txt', '1'), f('proj/b.txt', '2')], { autoStrip: false })
    expect(stripRoot).toBe('')
    expect(entries.map((e) => e.path)).toEqual(['proj/a.txt', 'proj/b.txt'])
  })
  it('formatCommitMessage: {filename} {count} {date}', () => {
    expect(formatCommitMessage('Upload {filename}', ['a/b.txt'])).toBe('Upload b.txt')
    expect(formatCommitMessage('Upload {filename}', ['a', 'b', 'c'])).toBe('Upload 3 files')
    expect(formatCommitMessage('', ['a', 'b'])).toBe('Upload 2 files')
    expect(formatCommitMessage('{count} @ {date}', ['a'])).toMatch(/^1 @ \d{4}-\d{2}-\d{2}$/)
  })
  it('clearRepo dengan scopePrefix hanya menghapus di dalam folder target', async () => {
    const gh = new FakeGitHub(); await gh.seed('main', { 'keep/root.txt': 'k', 'docs/old.txt': 'o', 'docs/sub/old2.txt': 'o2', 'top.txt': 't' })
    const r = await run(gh, [f('new.txt', 'n')], { clearRepo: true, scopePrefix: 'docs' }, { prefix: 'docs' })
    expect([...gh.head('main').keys()].sort()).toEqual(['docs/new.txt', 'keep/root.txt', 'top.txt'])
    expect(r.summary.deleted).toBe(2)
  })
  it('dryRun: melaporkan perubahan tanpa menulis apa pun', async () => {
    const gh = new FakeGitHub(); const c0 = await gh.seed('main', { 'a.txt': 'old', 'gone.txt': 'g' })
    const r = await run(gh, [f('a.txt', 'new'), f('b.bin', new Uint8Array(randomBytes(100)))], { dryRun: true, clearRepo: true })
    expect(r.changes).toEqual({ added: ['b.bin'], modified: ['a.txt'], deleted: ['gone.txt'] })
    expect(r.commitSha).toBeUndefined()
    expect(gh.refs.get('main')).toBe(c0)
    expect((gh.calls['blob'] ?? 0) + (gh.calls['createTree'] ?? 0) + (gh.calls['createCommit'] ?? 0)).toBe(0)
  })
  it('runDelete: file + folder dihapus dalam SATU commit', async () => {
    const gh = new FakeGitHub(); await gh.seed('main', { 'a.txt': '1', 'dir/x.txt': '2', 'dir/deep/y.txt': '3', 'keep.txt': '4' })
    const r = await runDelete(gh, { branch: 'main', paths: ['a.txt', 'dir'], message: 'hapus' }, { log: () => {}, progress: () => {} })
    expect(r.deleted).toBe(3)
    expect(gh.calls['createCommit']).toBe(1)
    expect([...gh.head('main').keys()]).toEqual(['keep.txt'])
    await expect(runDelete(gh, { branch: 'main', paths: ['nope'], message: 'x' }, { log: () => {}, progress: () => {} })).rejects.toThrow(/Tidak ada file/)
  })
  it('listRepos: pagination (>100 repo) & repo privat ikut', async () => {
    const mkRepo = (i: number) => ({ id: i, name: 'r' + i, private: i % 2 === 0 })
    const pages: Record<string, unknown[]> = { '1': Array.from({ length: 100 }, (_, i) => mkRepo(i)), '2': Array.from({ length: 37 }, (_, i) => mkRepo(100 + i)) }
    const urls: string[] = []
    const fetchImpl = (async (u: string) => { urls.push(u); const p = new URL(u).searchParams.get('page')!; return new Response(JSON.stringify(pages[p] ?? []), { status: 200 }) }) as unknown as typeof fetch
    const gh = new GitHubClient({ token: 't' }, { fetchImpl })
    const repos = await gh.listRepos()
    expect(repos.length).toBe(137)
    expect(urls.every((u) => u.includes('/user/repos') && u.includes('affiliation='))).toBe(true) // BUKAN /users/{u}/repos (publik saja)
    expect(repos.some((r) => r.private)).toBe(true)
  })
  it('error 422 menyertakan detail dari GitHub (mis. nama repo sudah ada)', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ message: 'Repository creation failed.', errors: [{ message: 'name already exists on this account' }] }), { status: 422 })) as unknown as typeof fetch
    const gh = new GitHubClient({ token: 't' }, { fetchImpl })
    await expect(gh.createRepo('x', '', false)).rejects.toThrow(/name already exists/)
  })
  it('getUser membaca scope token dari header', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ login: 'me' }), { status: 200, headers: { 'x-oauth-scopes': 'repo, workflow' } })) as unknown as typeof fetch
    const r = await new GitHubClient({ token: 't' }, { fetchImpl }).getUser()
    expect(r.user.login).toBe('me'); expect(r.scopes).toEqual(['repo', 'workflow'])
  })
  it('listContents meng-encode path & ref (nama file berisi # / ?)', async () => {
    let url = ''
    const fetchImpl = (async (u: string) => { url = u; return new Response('[]', { status: 200 }) }) as unknown as typeof fetch
    await new GitHubClient({ token: 't', owner: 'o', repo: 'r' }, { fetchImpl }).listContents('dir/my file#1', 'feature/x y')
    expect(url).toBe('https://api.github.com/repos/o/r/contents/dir/my%20file%231?ref=feature%2Fx%20y')
  })
})
