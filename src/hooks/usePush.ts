import { useState, useCallback } from 'react'
import type { ExtractedFile, LogEntry, PushState } from '@/types'
import { GitHubClient } from '@/utils/github'
import { prepareEntries } from '@/utils/paths'
import { runPush } from '@/engine/pushEngine'
import { formatTime, generateId } from '@/utils'

interface PushOptions {
  token: string
  owner: string
  repo: string
  branch: string
  commitMessage: string
  stripRoot?: string
  files: ExtractedFile[]
  clearRepo?: boolean
  onFileProgress?: (index: number) => void
}

export function usePush() {
  const [state, setState] = useState<PushState>({ status: 'idle', progress: 0, logs: [] })

  const push = useCallback(async (opts: PushOptions) => {
    const { token, owner, repo, files, clearRepo, onFileProgress } = opts
    const branch = (opts.branch || 'main').trim()

    setState({ status: 'pushing', progress: 0, logs: [] })

    const log = (type: LogEntry['type'], message: string) => {
      const entry: LogEntry = { id: generateId(), type, message, timestamp: formatTime() }
      setState((s) => ({ ...s, logs: [...s.logs, entry] }))
    }
    const progress = (p: number) => setState((s) => (p > s.progress ? { ...s, progress: p } : s))

    // Cegah layar mati / tab ditutup di tengah push (penyebab umum "timeout" di HP).
    let wakeLock: { release: () => Promise<void> } | null = null
    try { wakeLock = (await (navigator as any).wakeLock?.request('screen')) ?? null } catch { /* tidak didukung */ }
    const beforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', beforeUnload)

    try {
      const { entries, skipped, stripRoot } = prepareEntries(files, opts.stripRoot)
      if (stripRoot) log('info', `Stripping root folder: ${stripRoot}/`)
      if (skipped) log('warn', `Skipped ${skipped} junk/invalid/duplicate entr${skipped !== 1 ? 'ies' : 'y'} (__MACOSX, .DS_Store, .git, unsafe paths…)`)

      const gh = new GitHubClient(
        { token, owner, repo, branch },
        { onRetry: (m) => log('warn', m) }
      )

      const result = await runPush(
        gh,
        { branch, commitMessage: opts.commitMessage, entries, clearRepo: !!clearRepo, skipped },
        { log, progress, fileDone: (i) => onFileProgress?.(i) }
      )

      const { summary, commitSha } = result
      if (commitSha) {
        log('ok', `✓ Pushed in ${summary.requests} API requests (${summary.added} new, ${summary.modified} modified, ${summary.deleted} deleted, ${summary.unchanged} unchanged)`)
      }
      setState((s) => ({
        ...s,
        status: 'done',
        progress: 100,
        summary,
        commitUrl: commitSha ? `https://github.com/${owner.trim()}/${repo.trim()}/commit/${commitSha}` : undefined,
      }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      log('err', `✗ ${msg}`)
      setState((s) => ({ ...s, status: 'error', errorMessage: msg }))
    } finally {
      window.removeEventListener('beforeunload', beforeUnload)
      try { await wakeLock?.release() } catch { /* ignore */ }
    }
  }, [])

  const reset = useCallback(() => setState({ status: 'idle', progress: 0, logs: [] }), [])

  return { ...state, push, reset }
}
