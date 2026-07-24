import { useState, useCallback } from 'react'
import type { ExtractedFile, LogEntry, PushState, TreeItem } from '@/types'
import { GitHubService } from '@/utils/github'
import { formatTime, generateId, detectStripRoot } from '@/utils'

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
  const [state, setState] = useState<PushState>({
    status: 'idle',
    progress: 0,
    logs: [],
  })

  const addLog = useCallback(
    (type: LogEntry['type'], message: string) => {
      const entry: LogEntry = {
        id: generateId(),
        type,
        message,
        timestamp: formatTime(),
      }
      setState((s) => ({ ...s, logs: [...s.logs, entry] }))
    },
    []
  )

  const setProgress = useCallback((progress: number) => {
    setState((s) => ({ ...s, progress }))
  }, [])

  const push = useCallback(
    async (opts: PushOptions) => {
      const {
        token,
        owner,
        repo,
        branch,
        commitMessage,
        files,
        clearRepo,
        onFileProgress,
      } = opts

      setState({ status: 'pushing', progress: 0, logs: [] })

      const gh = new GitHubService({ token, owner, repo, branch })

      // Determine strip root
      const stripRoot =
        opts.stripRoot?.trim() ||
        detectStripRoot(files.map((f) => f.path)) ||
        ''

      const log = (type: LogEntry['type'], msg: string) => {
        const entry: LogEntry = {
          id: generateId(),
          type,
          message: msg,
          timestamp: formatTime(),
        }
        setState((s) => ({ ...s, logs: [...s.logs, entry] }))
      }

      const prog = (p: number) => setState((s) => ({ ...s, progress: p }))

      try {
        log('info', `Fetching branch: ${branch}`)
        const latestCommitSha = await gh.getBranchSha(branch)
        log('ok', `Branch SHA: ${latestCommitSha.slice(0, 7)}`)

        const baseTreeSha = await gh.getBaseTreeSha(latestCommitSha)
        log('ok', `Base tree: ${baseTreeSha.slice(0, 7)}`)

        const treeItems: TreeItem[] = []

        if (clearRepo) {
          log('info', 'Fetching existing files in repo…')
          const existingPaths = await gh.getAllFilePaths(baseTreeSha)
          if (existingPaths.length > 0) {
            log(
              'warn',
              `Deleting ${existingPaths.length} existing file${existingPaths.length !== 1 ? 's' : ''}…`
            )
            for (const p of existingPaths) {
              treeItems.push({ path: p, mode: '100644', type: 'blob', sha: null })
              log('plain', `  ✕ ${p}`)
            }
          } else {
            log('info', 'Repository is already empty.')
          }
        }

        log('info', `Uploading ${files.length} files as blobs…`)

        for (let i = 0; i < files.length; i++) {
          const f = files[i]
          let filePath = f.path

          if (stripRoot && filePath.startsWith(stripRoot + '/')) {
            filePath = filePath.slice(stripRoot.length + 1)
          }

          if (!filePath) continue

          prog(Math.round(((i + 1) / files.length) * 70))

          const blobSha = await gh.createBlob(f.data)
          treeItems.push({ path: filePath, mode: '100644', type: 'blob', sha: blobSha })

          onFileProgress?.(i)
          log('plain', `  ↑ ${filePath}`)
        }

        log('info', 'Creating tree…')
        prog(80)
        const treeSha = await gh.createTree(baseTreeSha, treeItems)
        log('ok', `Tree: ${treeSha.slice(0, 7)}`)

        log('info', 'Creating commit…')
        prog(90)
        const newCommit = await gh.createCommit(
          commitMessage,
          treeSha,
          latestCommitSha
        )
        log('ok', `Commit: ${newCommit.sha.slice(0, 7)}`)

        log('info', `Updating ${branch}…`)
        prog(97)
        await gh.updateRef(branch, newCommit.sha)

        prog(100)
        const pushedCount = files.length
        log('ok', `✓ Pushed ${pushedCount} file${pushedCount !== 1 ? 's' : ''} successfully`)

        const commitUrl = `https://github.com/${owner}/${repo}/commit/${newCommit.sha}`
        setState((s) => ({ ...s, status: 'done', commitUrl }))
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        log('err', `✗ ${msg}`)
        setState((s) => ({ ...s, status: 'error', errorMessage: msg }))
      }
    },
    [addLog, setProgress]
  )

  const reset = useCallback(() => {
    setState({ status: 'idle', progress: 0, logs: [] })
  }, [])

  return { ...state, push, reset }
}
