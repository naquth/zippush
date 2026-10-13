import { useState, useEffect, useCallback } from 'react'
import { StepCard } from './components/StepCard'
import { TokenInput } from './components/TokenInput'
import { Input, TextArea } from './components/Input'
import { DropZone } from './components/DropZone'
import { FileList } from './components/FileList'
import { PushLog } from './components/PushLog'
import { ResultBanner } from './components/ResultBanner'
import { ArrowUpIcon, ZapIcon, LayersIcon, GitBranchIcon, TrashIcon, AlertIcon } from './components/Icons'
import { useZipExtract } from './hooks/useZipExtract'
import { usePush } from './hooks/usePush'

const STORAGE_KEY = 'zp_token'

export default function App() {
  const [token, setToken]           = useState('')
  const [saveToken, setSaveToken]   = useState(false)
  const [owner, setOwner]           = useState('')
  const [repo, setRepo]             = useState('')
  const [branch, setBranch]         = useState('main')
  const [commitMsg, setCommitMsg]   = useState('')
  const [stripRoot, setStripRoot]   = useState('')
  const [activeStep, setActiveStep] = useState(1)
  const [uploadedIndices, setUploadedIndices] = useState<Set<number>>(new Set())
  const [clearRepo, setClearRepo]   = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  const zip  = useZipExtract()
  const push = usePush()

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) { setToken(saved); setSaveToken(true) }
  }, [])

  useEffect(() => {
    if (zip.status === 'done') setActiveStep(3)
  }, [zip.status])

  const handleFile = useCallback((file: File) => {
    setUploadedIndices(new Set())
    zip.extract(file)
  }, [zip])

  const handlePush = async () => {
    if (isPushing)           return
    if (!token)              return alert('Please enter your GitHub token.')
    if (!owner || !repo)     return alert('Please enter owner and repo name.')
    if (!zip.files.length)   return alert('Please upload a ZIP file first.')

    if (clearRepo && !confirmClear) {
      setConfirmClear(true)
      return
    }

    if (saveToken) localStorage.setItem(STORAGE_KEY, token)
    else           localStorage.removeItem(STORAGE_KEY)

    setUploadedIndices(new Set())
    setConfirmClear(false)

    await push.push({
      token, owner, repo,
      branch:        branch || 'main',
      commitMessage: commitMsg || 'update via ZipPush',
      stripRoot,
      files:         zip.files,
      clearRepo,
      onFileProgress: (i) => setUploadedIndices(p => new Set([...p, i])),
    })
  }

  const isPushing = push.status === 'pushing'
  const showLog   = push.status !== 'idle'

  return (
    <div className="min-h-screen bg-canvas noise-bg overflow-x-hidden">

      {/* ── TICKER TAPE ── */}
      <div className="bg-primary border-b-2 border-border py-1.5 overflow-hidden">
        <div className="flex animate-marquee whitespace-nowrap">
          {Array(4).fill(null).map((_, i) => (
            <span key={i} className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-canvas mr-12">
              ★ ZipPush — Deploy ZIP to GitHub &nbsp;·&nbsp; No Terminal Needed &nbsp;·&nbsp; 100% Client-Side &nbsp;·&nbsp; Zero Backend &nbsp;·&nbsp; Free Forever &nbsp;·&nbsp;
            </span>
          ))}
        </div>
      </div>

      {/* ── HEADER ── */}
      <header className="border-b-2 border-border bg-secondary">
        <div className="max-w-[680px] mx-auto px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 border-2 border-border bg-canvas shadow-brutal-sm
              flex items-center justify-center text-primary">
              <ZapIcon size={16} />
            </div>
            <span className="font-display text-[20px] font-800 tracking-tight text-ink">
              ZipPush
            </span>
            <span className="font-mono text-[9px] font-bold uppercase tracking-widest
              border-2 border-border bg-primary text-canvas px-2 py-0.5 shadow-brutal-sm">
              beta
            </span>
          </div>

          <nav className="flex items-center gap-4">
            <a
              href="https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens"
              target="_blank" rel="noopener noreferrer"
              className="font-mono text-[11px] font-bold text-ink hover:text-primary transition-colors underline underline-offset-2"
            >
              docs ↗
            </a>
            <a
              href="https://github.com/settings/tokens"
              target="_blank" rel="noopener noreferrer"
              className="font-mono text-[11px] font-bold text-ink hover:text-primary transition-colors underline underline-offset-2"
            >
              tokens ↗
            </a>
          </nav>
        </div>
      </header>

      {/* ── PAGE ── */}
      <div className="max-w-[680px] mx-auto px-5 pb-24">

        {/* ══ HERO ══ */}
        <div className="py-12 animate-up">
          {/* Eyebrow tag */}
          <div className="inline-flex items-center gap-2 mb-6 border-2 border-border bg-accent px-3 py-1.5 shadow-brutal-sm">
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-ink">
              Mobile-first GitHub deploy
            </span>
          </div>

          <h1 className="font-display text-[clamp(40px,9vw,64px)] font-800 leading-[1.0] tracking-[-0.03em] mb-6 text-ink">
            Push code<br />
            <span className="relative inline-block">
              <span className="relative z-10">without a</span>
            </span>
            <br />
            <span className="bg-primary text-canvas px-2 inline-block -skew-x-2 shadow-brutal-lg">terminal.</span>
          </h1>

          <p className="font-sans text-[15px] text-ink-2 max-w-[440px] leading-relaxed mb-8 border-l-4 border-primary pl-4">
            Export your project as a ZIP, drop it here — we extract every file
            client-side and commit directly to GitHub via the API.
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-2">
            {[
              { icon: <LayersIcon size={12} />,    label: 'Client-side extraction', color: 'bg-accent' },
              { icon: <GitBranchIcon size={12} />, label: 'Git tree API',            color: 'bg-secondary' },
              { icon: <ZapIcon size={12} />,       label: 'Zero backend',            color: 'bg-green' },
            ].map(({ icon, label, color }) => (
              <div key={label}
                className={`flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-widest
                  border-2 border-border px-3 py-1.5 shadow-brutal-sm ${color} text-ink`}>
                {icon}
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* ══ SETUP DIVIDER ══ */}
        <div className="flex items-center gap-0 mb-6">
          <div className="flex-1 h-0.5 bg-border" />
          <div className="border-2 border-border bg-ink px-4 py-1">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-canvas">setup</span>
          </div>
          <div className="flex-1 h-0.5 bg-border" />
        </div>

        {/* ══ STEPS ══ */}
        <div className="flex flex-col gap-4">

          {/* Step 1 */}
          <div className="animate-up delay-75">
            <StepCard number={1} title="GitHub Authentication"
              active={activeStep === 1}
              done={!!(token && owner && repo)}
            >
              <div className="flex flex-col gap-4">
                <TokenInput
                  value={token} onChange={setToken}
                  saveToken={saveToken} onSaveChange={setSaveToken}
                />
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Owner" placeholder="octocat"
                    value={owner} onChange={e => setOwner(e.target.value)}
                    onFocus={() => setActiveStep(1)}
                    autoComplete="off" spellCheck={false}
                  />
                  <Input
                    label="Repository" placeholder="my-project"
                    value={repo} onChange={e => setRepo(e.target.value)}
                    onFocus={() => setActiveStep(1)}
                    autoComplete="off" spellCheck={false}
                  />
                </div>
                <Input
                  label="Branch" placeholder="main"
                  value={branch} onChange={e => setBranch(e.target.value)}
                  onFocus={() => setActiveStep(1)}
                  autoComplete="off" spellCheck={false}
                />
              </div>
            </StepCard>
          </div>

          {/* Step 2 */}
          <div className="animate-up delay-150">
            <StepCard number={2} title="Upload ZIP" badge="client-side"
              active={activeStep === 2}
              done={zip.status === 'done'}
            >
              <DropZone
                onFile={handleFile}
                status={zip.status}
                fileName={zip.fileName}
                error={zip.error}
              />
              {zip.status === 'done' && (
                <FileList files={zip.files} uploadedIndices={uploadedIndices} />
              )}
            </StepCard>
          </div>

          {/* Step 3 */}
          <div className="animate-up delay-225">
            <StepCard number={3} title="Commit Details"
              active={activeStep === 3}
              done={push.status === 'done'}
            >
              <div className="flex flex-col gap-4">
                <TextArea
                  label="Commit Message"
                  value={commitMsg}
                  onChange={e => setCommitMsg(e.target.value)}
                  onFocus={() => setActiveStep(3)}
                  placeholder="feat: update from mobile via ZipPush"
                />
                <Input
                  label="Strip Root Folder"
                  value={stripRoot}
                  onChange={e => setStripRoot(e.target.value)}
                  onFocus={() => setActiveStep(3)}
                  placeholder="auto-detected from ZIP structure"
                  autoComplete="off"
                  hint={<span className="font-mono text-[10px] text-ink-3 font-bold">optional</span>}
                />

                {/* Clear repo toggle */}
                <label
                  className={[
                    'flex items-start gap-3 border-2 border-border px-3 py-2.5 cursor-pointer transition-colors',
                    clearRepo ? 'bg-red/10 shadow-brutal-sm' : 'bg-paper',
                  ].join(' ')}
                  onClick={() => setActiveStep(3)}
                >
                  <input
                    type="checkbox"
                    checked={clearRepo}
                    onChange={e => { setClearRepo(e.target.checked); setConfirmClear(false) }}
                    className="mt-0.5 w-4 h-4 border-2 border-border accent-red flex-shrink-0"
                  />
                  <div className="flex flex-col gap-0.5">
                    <span className="flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-widest text-ink">
                      <TrashIcon size={12} />
                      Delete all existing files first
                    </span>
                    <span className="font-mono text-[10px] text-ink-3 font-bold leading-relaxed">
                      Removes every file &amp; folder currently in the repo/branch before pushing your ZIP. Cannot be undone.
                    </span>
                  </div>
                </label>
              </div>
            </StepCard>
          </div>
        </div>

        {/* ══ CLEAR REPO CONFIRMATION ══ */}
        {confirmClear && (
          <div className="mt-5 border-2 border-border bg-red/10 shadow-brutal-red p-4 animate-scale-in flex flex-col gap-3">
            <div className="flex items-center gap-2 text-red">
              <AlertIcon size={16} />
              <span className="font-display text-[13px] font-800 uppercase tracking-wide">
                Confirm deletion
              </span>
            </div>
            <p className="font-mono text-[11px] text-ink-2 font-bold leading-relaxed">
              This will permanently delete ALL files and folders in{' '}
              <span className="text-ink">{owner || 'owner'}/{repo || 'repo'}</span> on branch{' '}
              <span className="text-ink">{branch || 'main'}</span>, then push your ZIP contents.
              This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmClear(false)}
                className="flex-1 py-2.5 border-2 border-border bg-canvas text-ink font-mono text-[11px] font-bold uppercase tracking-widest btn-brutal"
              >
                Cancel
              </button>
              <button
                onClick={handlePush}
                className="flex-1 py-2.5 border-2 border-border bg-red text-canvas font-mono text-[11px] font-bold uppercase tracking-widest btn-brutal"
              >
                Yes, delete &amp; push
              </button>
            </div>
          </div>
        )}

        {/* ══ PUSH BUTTON ══ */}
        {!confirmClear && (
          <div className="mt-5 animate-up delay-300">
            <button
              onClick={handlePush}
              disabled={isPushing}
              className={[
                'relative w-full py-4 border-2 border-border',
                'font-display text-[15px] font-800 tracking-wide uppercase',
                'flex items-center justify-center gap-3',
                'btn-brutal',
                isPushing
                  ? 'bg-paper text-ink-3 cursor-not-allowed'
                  : clearRepo
                    ? 'bg-red text-canvas hover:bg-red/90'
                    : 'bg-primary text-canvas hover:bg-primary-dark',
              ].join(' ')}
            >
              {isPushing ? (
                <>
                  <div className="w-5 h-5 border-3 border-canvas/30 border-t-canvas animate-spin" style={{borderWidth:'3px'}} />
                  <span>{clearRepo ? 'Clearing & pushing…' : 'Pushing to GitHub…'}</span>
                </>
              ) : (
                <>
                  {clearRepo ? <TrashIcon size={16} /> : <ArrowUpIcon size={16} />}
                  <span>{clearRepo ? 'Clear repo & push' : 'Push to GitHub'}</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* ══ TERMINAL LOG ══ */}
        {showLog && (
          <PushLog logs={push.logs} status={push.status} progress={push.progress} />
        )}

        {/* ══ RESULT ══ */}
        <ResultBanner
          status={push.status}
          commitUrl={push.commitUrl}
          errorMessage={push.errorMessage}
          fileCount={zip.files.length}
          branch={branch || 'main'}
          summary={push.summary}
        />

        {/* ══ FOOTER ══ */}
        <footer className="mt-20 border-t-2 border-border pt-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 bg-green border border-border animate-pulse-soft" />
            <span className="font-mono text-[11px] font-bold text-ink-3 uppercase tracking-widest">
              Token never leaves your browser
            </span>
          </div>
          <p className="font-mono text-[10px] text-ink-3 font-bold">
            ZipPush · built for mobile devs ·{' '}
            <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer"
              className="text-primary hover:underline underline-offset-2">manage tokens ↗</a>
          </p>
        </footer>
      </div>
    </div>
  )
}
