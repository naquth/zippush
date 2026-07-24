export interface ExtractedFile {
  path: string
  data: Uint8Array
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

export interface PushState {
  status: 'idle' | 'pushing' | 'done' | 'error'
  progress: number
  logs: LogEntry[]
  commitUrl?: string
  errorMessage?: string
}

export interface TreeItem {
  path: string
  mode: '100644'
  type: 'blob'
  sha: string | null
}
