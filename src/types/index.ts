export interface ExtractedFile {
  path: string
  data: Uint8Array
  /** true jika bit executable (chmod +x) aktif di ZIP */
  executable?: boolean
}

export interface LogEntry {
  id: string
  type: 'ok' | 'err' | 'warn' | 'info' | 'plain'
  message: string
  timestamp: string
}

export interface GitHubConfig {
  token: string
  owner: string
  repo: string
  branch: string
}

export type FileMode = '100644' | '100755'

/** File yang sudah dinormalisasi & siap di-diff/di-push */
export interface PushEntry {
  /** index file di array ExtractedFile asli (untuk indikator di FileList) */
  srcIndex: number
  path: string
  data: Uint8Array
  mode: FileMode
}

export interface PushSummary {
  added: number
  modified: number
  unchanged: number
  deleted: number
  skipped: number
  requests: number
}

export interface PushState {
  status: 'idle' | 'pushing' | 'done' | 'error'
  progress: number
  logs: LogEntry[]
  commitUrl?: string
  errorMessage?: string
  summary?: PushSummary
}

export interface TreeItem {
  path: string
  mode: string
  type: 'blob'
  /** sha blob, atau null untuk menghapus file */
  sha?: string | null
  /** isi teks inline (GitHub membuat blob-nya sendiri, tanpa request terpisah) */
  content?: string
}
