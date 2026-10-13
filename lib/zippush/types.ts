export interface ExtractedFile {
  path: string
  data: Uint8Array
  /** true jika bit executable (chmod +x) aktif di ZIP */
  executable?: boolean
}

export type FileMode = '100644' | '100755'

/** File yang sudah dinormalisasi & siap di-diff/di-push */
export interface PushEntry {
  /** index sumber (untuk indikator progres di UI) */
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

export interface ChangeSet {
  added: string[]
  modified: string[]
  deleted: string[]
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

export type LogType = 'ok' | 'err' | 'warn' | 'info' | 'plain'
