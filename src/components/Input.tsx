import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string
  hint?: React.ReactNode
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, className = '', ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {(label || hint) && (
        <div className="flex items-center justify-between">
          {label && (
            <label className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-ink">
              {label}
            </label>
          )}
          {hint && <span className="text-[10px] font-mono text-ink-3">{hint}</span>}
        </div>
      )}
      <input
        ref={ref}
        className={[
          'w-full bg-white border-2 border-border px-3 py-2.5',
          'font-mono text-[13px] text-ink',
          'placeholder:text-ink-3',
          'brutalist-input',
          error ? 'border-red shadow-brutal-red' : '',
          className,
        ].join(' ')}
        {...props}
      />
      {error && <p className="text-[11px] text-red font-mono font-bold">⚠ {error}</p>}
    </div>
  )
)
Input.displayName = 'Input'

type TAProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }

export const TextArea = forwardRef<HTMLTextAreaElement, TAProps>(
  ({ label, className = '', ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-ink">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        className={[
          'w-full bg-white border-2 border-border px-3 py-2.5',
          'font-mono text-[13px] text-ink resize-y min-h-[80px]',
          'placeholder:text-ink-3',
          'brutalist-input',
          className,
        ].join(' ')}
        {...props}
      />
    </div>
  )
)
TextArea.displayName = 'TextArea'
