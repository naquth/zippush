import { useEffect, useRef } from 'react'
import type { LogEntry, PushState } from '@/types'

interface Props {
  logs: LogEntry[]
  status: PushState['status']
  progress: number
}

const msgStyle: Record<LogEntry['type'], string> = {
  ok:    'text-green',
  err:   'text-red',
  warn:  'text-orange',
  info:  'text-accent-2',
  plain: 'text-ink-2',
}

const prefix: Record<LogEntry['type'], string> = {
  ok:    '✓',
  err:   '✗',
  warn:  '!',
  info:  '→',
  plain: ' ',
}

export function PushLog({ logs, status, progress }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs.length])

  const isPushing = status === 'pushing'
  const isDone    = status === 'done'
  const isError   = status === 'error'

  const headerBg = isError ? 'bg-red' : isDone ? 'bg-green' : isPushing ? 'bg-secondary' : 'bg-paper'
  const shadowClass = isError ? 'shadow-brutal-red' : isDone ? 'shadow-brutal-green' : 'shadow-brutal'

  return (
    <div className={`mt-5 border-2 border-border ${shadowClass} animate-scale-in`}>
      {/* Terminal chrome */}
      <div className={`flex items-center gap-3 px-4 py-3 border-b-2 border-border ${headerBg}`}>
        <div className="flex gap-1.5">
          <div className="w-3 h-3 border-2 border-border bg-red" />
          <div className="w-3 h-3 border-2 border-border bg-secondary" />
          <div className="w-3 h-3 border-2 border-border bg-green" />
        </div>

        <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-ink">
          {isPushing ? '▶ running...' : isDone ? '✓ done' : isError ? '✗ failed' : 'terminal'}
        </span>

        {isPushing && (
          <span className="ml-auto font-mono text-[11px] font-bold text-ink bg-canvas border border-border px-2 py-0.5">
            {progress}%
          </span>
        )}
        {isDone && (
          <span className="ml-auto font-mono text-[11px] font-bold text-canvas">
            complete
          </span>
        )}
        {isError && (
          <span className="ml-auto font-mono text-[11px] font-bold text-canvas">
            error
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-paper border-b-2 border-border">
        <div
          className={[
            'h-full transition-all duration-300 ease-out border-r-2 border-border',
            isError ? 'bg-red' : 'bg-primary',
          ].join(' ')}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Log body */}
      <div className="bg-ink p-4 max-h-60 overflow-y-auto font-mono">
        <div className="text-[10px] text-ink-3 mb-3 pb-2 border-b border-ink-2 tracking-widest uppercase font-bold">
          $ output
        </div>

        {logs.map((entry, i) => (
          <div
            key={entry.id}
            className="flex items-start gap-3 leading-[1.9] animate-in"
            style={{ animationDelay: `${i * 10}ms` }}
          >
            <span className="text-ink-3 text-[10px] flex-shrink-0 pt-[1px] w-14">{entry.timestamp}</span>
            <span className={`text-[10px] flex-shrink-0 pt-[1px] w-3 font-bold ${msgStyle[entry.type]}`}>
              {prefix[entry.type]}
            </span>
            <span className={`text-[11px] ${msgStyle[entry.type]} break-all`}>{entry.message}</span>
          </div>
        ))}

        {isPushing && (
          <div className="flex items-center gap-3 mt-1">
            <span className="text-[10px] text-ink-3 w-14" />
            <span className="w-3" />
            <span className="w-2 h-4 bg-primary inline-block animate-blink" />
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  )
}
