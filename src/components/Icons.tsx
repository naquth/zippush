import { type SVGProps } from 'react'

type P = SVGProps<SVGSVGElement> & { size?: number }

function I({ size = 14, children, ...p }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" {...p}>
      {children}
    </svg>
  )
}

export const EyeIcon = ({ size }: { size?: number }) => <I size={size}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></I>
export const EyeOffIcon = ({ size }: { size?: number }) => <I size={size}><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></I>
export const CheckIcon = ({ size }: { size?: number }) => <I size={size}><polyline points="20 6 9 17 4 12"/></I>
export const ArrowUpIcon = ({ size }: { size?: number }) => <I size={size}><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></I>
export const ExternalLinkIcon = ({ size }: { size?: number }) => <I size={size}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></I>
export const AlertIcon = ({ size }: { size?: number }) => <I size={size}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></I>
export const UploadIcon = ({ size }: { size?: number }) => <I size={size}><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></I>
export const GitBranchIcon = ({ size }: { size?: number }) => <I size={size}><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></I>
export const ZapIcon = ({ size }: { size?: number }) => <I size={size}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></I>
export const ShieldIcon = ({ size }: { size?: number }) => <I size={size}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></I>
export const LayersIcon = ({ size }: { size?: number }) => <I size={size}><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></I>
export const TrashIcon = ({ size }: { size?: number }) => <I size={size}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></I>
