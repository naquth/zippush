import { type ReactNode } from 'react'
import { CheckIcon } from './Icons'

interface Props {
  number: number
  title: string
  subtitle?: string
  badge?: string
  active?: boolean
  done?: boolean
  children: ReactNode
}

const stepColors = [
  { bg: 'bg-secondary', border: 'border-border', shadow: 'shadow-brutal' },
  { bg: 'bg-accent',    border: 'border-border', shadow: 'shadow-brutal' },
  { bg: 'bg-primary',   border: 'border-border', shadow: 'shadow-brutal' },
]

export function StepCard({ number, title, subtitle, badge, active = false, done = false, children }: Props) {
  const color = stepColors[(number - 1) % stepColors.length]

  return (
    <div className={[
      'relative border-2 border-border transition-all duration-200',
      active && !done ? 'shadow-brutal-lg' : 'shadow-brutal',
      done ? 'opacity-90' : '',
      'bg-canvas',
    ].join(' ')}>

      {/* Step number header bar */}
      <div className={[
        'flex items-center gap-3 px-5 py-3 border-b-2 border-border',
        done ? 'bg-green' : active ? color.bg : 'bg-paper',
      ].join(' ')}>
        <div className={[
          'w-8 h-8 border-2 border-border flex items-center justify-center flex-shrink-0 font-mono font-bold text-sm',
          done ? 'bg-canvas text-green' : 'bg-canvas text-ink',
        ].join(' ')}>
          {done ? <CheckIcon size={14} /> : number}
        </div>

        <span className="font-display font-800 text-[15px] tracking-tight text-ink flex-1">
          {title}
        </span>

        {badge && (
          <span className="font-mono text-[9px] font-bold uppercase tracking-widest border-2 border-border bg-canvas px-2 py-0.5">
            {badge}
          </span>
        )}

        {subtitle && (
          <span className="font-mono text-[10px] text-ink-3">{subtitle}</span>
        )}
      </div>

      <div className="p-5">
        {children}
      </div>
    </div>
  )
}
