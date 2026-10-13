import { useState, useCallback } from 'react'
import JSZip from 'jszip'
import type { ExtractedFile } from '@/types'

interface ZipState {
  files: ExtractedFile[]
  fileName: string | null
  status: 'idle' | 'loading' | 'done' | 'error'
  error: string | null
}

export function useZipExtract() {
  const [state, setState] = useState<ZipState>({
    files: [],
    fileName: null,
    status: 'idle',
    error: null,
  })

  const extract = useCallback(async (file: File) => {
    setState({ files: [], fileName: file.name, status: 'loading', error: null })

    try {
      const zip = await JSZip.loadAsync(file)
      const files: ExtractedFile[] = []

      const promises: Promise<void>[] = []
      zip.forEach((relativePath, zipEntry) => {
        if (zipEntry.dir) return
        const executable = zipEntry.unixPermissions != null && (Number(zipEntry.unixPermissions) & 0o111) !== 0
        promises.push(
          zipEntry.async('uint8array').then((data) => {
            files.push({ path: relativePath, data, executable })
          })
        )
      })

      await Promise.all(promises)
      // Promise.all selesai berurutan acak → urutkan supaya daftar & hasil deterministik
      files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
      setState({ files, fileName: file.name, status: 'done', error: null })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setState((s) => ({ ...s, status: 'error', error: msg }))
    }
  }, [])

  const reset = useCallback(() => {
    setState({ files: [], fileName: null, status: 'idle', error: null })
  }, [])

  return { ...state, extract, reset }
}
