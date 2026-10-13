import { ExternalLinkIcon, AlertIcon, CheckIcon } from './Icons'
import type { PushState, PushSummary } from '@/types'

interface Props {
  status: PushState['status']
  commitUrl?: string
  errorMessage?: string
  fileCount?: number
  branch?: string
  summary?: PushSummary
}

export function ResultBanner({ status, commitUrl, errorMessage, fileCount, branch, summary }: Props) {
  if (status !== 'done' && status !== 'error') return null
  const ok = status === 'done'

  return (
    <div className={[
      'flex items-center gap-4 border-2 border-border px-5 py-4 mt-4 animate-scale-in',
      ok ? 'bg-green shadow-brutal-green' : 'bg-red shadow-brutal-red',
    ].join(' ')}>
      <div className="w-10 h-10 border-2 border-border bg-canvas flex items-center justify-center flex-shrink-0">
        {ok ? <CheckIcon size={16} /> : <AlertIcon size={16} />}
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-display font-800 text-[14px] text-canvas">
          {!ok
            ? '✗ Push failed'
            : !commitUrl
              ? `✓ Already up to date → ${branch}`
              : `✓ Pushed ${summary ? summary.added + summary.modified : fileCount} changed file${(summary ? summary.added + summary.modified : fileCount) !== 1 ? 's' : ''} → ${branch}`}
        </p>
        {ok && summary && (
          <p className="text-[11px] text-canvas/80 font-mono mt-0.5">
            +{summary.added} new · ~{summary.modified} modified · −{summary.deleted} deleted · ={summary.unchanged} unchanged · {summary.requests} requests
          </p>
        )}
        {!ok && errorMessage && (
          <p className="text-[11px] text-canvas/80 font-mono mt-0.5 truncate">{errorMessage}</p>
        )}
      </div>

      {ok && commitUrl && (
        <a
          href={commitUrl}
          target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[11px] font-mono font-bold text-ink
            bg-canvas border-2 border-border px-3 py-2 flex-shrink-0
            hover:bg-secondary transition-colors shadow-brutal-sm hover:shadow-brutal"
        >
          view commit
          <ExternalLinkIcon size={11} />
        </a>
      )}
    </div>
  )
}
