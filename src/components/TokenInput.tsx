import { useState } from 'react'
import { EyeIcon, EyeOffIcon, ShieldIcon } from './Icons'

interface Props {
  value: string
  onChange: (v: string) => void
  saveToken: boolean
  onSaveChange: (v: boolean) => void
}

export function TokenInput({ value, onChange, saveToken, onSaveChange }: Props) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-ink">
          Personal Access Token
        </label>
        <a
          href="https://github.com/settings/tokens/new?scopes=repo&description=ZipPush"
          target="_blank" rel="noopener noreferrer"
          className="font-mono text-[10px] font-bold text-primary hover:underline underline-offset-2"
        >
          generate ↗
        </a>
      </div>

      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
          autoComplete="off" spellCheck={false}
          className="w-full bg-white border-2 border-border px-3 py-2.5 pr-12
            font-mono text-[13px] text-ink tracking-widest
            placeholder:text-ink-3 placeholder:tracking-wide
            brutalist-input"
        />
        <button
          type="button"
          onClick={() => setVisible(v => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 hover:text-primary transition-colors p-1"
          aria-label="Toggle visibility"
        >
          {visible ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
        </button>
      </div>

      <label className="flex items-center gap-2.5 cursor-pointer group w-fit mt-1">
        <div className="relative">
          <input
            type="checkbox" checked={saveToken}
            onChange={(e) => onSaveChange(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-9 h-5 border-2 border-border bg-white
            peer-checked:bg-secondary
            transition-colors duration-150 relative">
            <div className="absolute top-0.5 left-0.5 w-3 h-3 bg-ink
              peer-checked:translate-x-4
              transition-transform duration-150" />
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] font-mono font-bold text-ink-3 group-hover:text-ink transition-colors">
          <ShieldIcon size={11} />
          <span>Save in localStorage</span>
        </div>
      </label>
    </div>
  )
}
