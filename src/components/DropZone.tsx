import { useRef, useState, type DragEvent, type ChangeEvent } from 'react'
import { UploadIcon } from './Icons'

interface Props {
  onFile: (file: File) => void
  status: 'idle' | 'loading' | 'done' | 'error'
  fileName: string | null
  error: string | null
}

export function DropZone({ onFile, status, fileName, error }: Props) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file?.name.endsWith('.zip')) onFile(file)
  }

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onFile(file)
  }

  const isIdle = status === 'idle'
  const isLoading = status === 'loading'
  const isDone = status === 'done'
  const isError = status === 'error'

  const borderClass = isDone
    ? 'border-green shadow-brutal-green'
    : isError
    ? 'border-red shadow-brutal-red'
    : dragging
    ? 'border-primary shadow-brutal-primary bg-secondary/20'
    : 'border-border shadow-brutal hover:border-primary hover:shadow-brutal-primary'

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={[
        'relative border-2 border-dashed cursor-pointer select-none',
        'transition-all duration-150',
        borderClass,
        'bg-paper',
      ].join(' ')}
    >
      <input ref={inputRef} type="file" accept=".zip" className="hidden" onChange={handleChange} />

      <div className="flex flex-col items-center gap-4 py-12 px-6">
        {isIdle && (
          <>
            <div className="w-14 h-14 border-2 border-border bg-white shadow-brutal-sm
              flex items-center justify-center text-ink">
              <UploadIcon size={22} />
            </div>
            <div className="text-center">
              <p className="font-display font-700 text-[14px] text-ink mb-1">
                <span className="text-primary">Choose file</span> or drag & drop
              </p>
              <p className="font-mono text-[11px] text-ink-3 font-bold uppercase tracking-widest">.zip files only</p>
            </div>
          </>
        )}

        {isLoading && (
          <>
            <div className="w-14 h-14 border-2 border-border bg-secondary shadow-brutal-sm
              flex items-center justify-center">
              <div className="w-6 h-6 border-3 border-ink border-t-transparent animate-spin" style={{borderWidth:'3px'}} />
            </div>
            <p className="font-display font-700 text-[14px] text-ink">
              Extracting <span className="font-mono text-primary">{fileName}</span>
            </p>
          </>
        )}

        {isDone && fileName && (
          <>
            <div className="w-14 h-14 border-2 border-border bg-green shadow-brutal-sm
              flex items-center justify-center text-canvas">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <div className="text-center">
              <p className="font-display font-700 text-[14px] text-green">{fileName}</p>
              <p className="font-mono text-[11px] text-ink-3 mt-1 font-bold uppercase tracking-widest">tap to replace</p>
            </div>
          </>
        )}

        {isError && (
          <>
            <div className="w-14 h-14 border-2 border-border bg-red shadow-brutal-sm
              flex items-center justify-center text-canvas">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </div>
            <p className="font-display font-700 text-[13px] text-red text-center max-w-xs">
              {error ?? 'Failed to read ZIP'}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
