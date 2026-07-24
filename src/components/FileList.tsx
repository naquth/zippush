import { type ExtractedFile } from '@/types'
import { formatBytes } from '@/utils'

interface Props {
  files: ExtractedFile[]
  uploadedIndices: Set<number>
}

function fileExt(path: string) {
  return path.split('.').pop()?.toLowerCase() ?? ''
}

function extColor(ext: string): string {
  const map: Record<string, string> = {
    ts: 'text-accent', tsx: 'text-accent', js: 'text-secondary', jsx: 'text-secondary',
    css: 'text-accent-2', scss: 'text-accent-2', html: 'text-primary',
    json: 'text-orange', md: 'text-ink-2', svg: 'text-green',
    png: 'text-green', jpg: 'text-green', jpeg: 'text-green',
  }
  return map[ext] ?? 'text-ink-3'
}

export function FileList({ files, uploadedIndices }: Props) {
  if (!files.length) return null

  return (
    <div className="mt-4 border-2 border-border shadow-brutal animate-scale-in overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-ink border-b-2 border-border">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 border border-ink-2 bg-red" />
            <div className="w-3 h-3 border border-ink-2 bg-secondary" />
            <div className="w-3 h-3 border border-ink-2 bg-green" />
          </div>
          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-ink-3 ml-1">
            extracted files
          </span>
        </div>
        <span className="font-mono text-[10px] font-bold text-primary bg-canvas border border-border px-2 py-0.5">
          {files.length} file{files.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* File entries */}
      <div className="max-h-52 overflow-y-auto bg-ink divide-y divide-ink-2/30">
        {files.map((f, i) => {
          const ext = fileExt(f.path)
          const uploaded = uploadedIndices.has(i)
          const segments = f.path.split('/')
          const fname = segments.pop() ?? f.path
          const dir = segments.length ? segments.join('/') + '/' : ''

          return (
            <div
              key={f.path}
              className="flex items-center gap-3 px-4 py-2 animate-in"
              style={{ animationDelay: `${Math.min(i * 15, 250)}ms` }}
            >
              <div className={[
                'w-1.5 h-1.5 flex-shrink-0 border border-current',
                uploaded ? 'bg-primary text-primary animate-pulse-soft' : 'bg-ink-3 text-ink-3',
              ].join(' ')} />

              <div className="flex-1 font-mono text-[11px] leading-relaxed truncate">
                {dir && <span className="text-ink-3">{dir}</span>}
                <span className={extColor(ext)}>{fname}</span>
              </div>

              <span className="font-mono text-[10px] text-ink-3 flex-shrink-0">
                {formatBytes(f.data.byteLength)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
