import { X, Eye, History } from 'lucide-react'
import { Button } from '@git-manager/ui'

interface BlameHistoryPanelProps {
  mode: 'blame' | 'history'
  file: { path: string; staged: boolean; oid?: string } | null
  onClose: () => void
}

export function BlameHistoryPanel({ mode, file, onClose }: BlameHistoryPanelProps) {
  const isBlame = mode === 'blame'

  const fileName = file ? file.path.split('/').pop() || file.path : 'Unknown file'
  const fileDir =
    file && file.path.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/') + 1) : ''

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-card">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/20 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          {isBlame ? (
            <Eye className="h-4 w-4 shrink-0 animate-pulse text-primary" />
          ) : (
            <History className="h-4 w-4 shrink-0 text-primary" />
          )}
          <h2 className="select-none truncate text-xs font-semibold text-foreground">
            {isBlame ? 'Git Blame' : 'File History'}
          </h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 hover:bg-accent"
          onClick={onClose}
          title="Close panel"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* File Info Banner */}
      {file && (
        <div className="shrink-0 select-none border-b border-border/50 bg-muted/10 px-4 py-2">
          <div className="flex min-w-0 flex-col">
            {fileDir && (
              <span className="animate-in fade-in mb-0.5 truncate font-mono text-[9px] leading-none text-muted-foreground/60 duration-200">
                {fileDir}
              </span>
            )}
            <span className="animate-in fade-in duration-250 truncate font-mono text-xs font-medium text-foreground">
              {fileName}
            </span>
          </div>
        </div>
      )}

      {/* Content Area */}
      <div className="relative flex flex-1 select-none flex-col items-center justify-center overflow-y-auto bg-gradient-to-b from-card to-background p-6 text-center">
        {/* Glow decorative background */}
        <div className="pointer-events-none absolute left-1/2 top-1/3 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-[50px]" />

        <div className="z-10 flex w-full max-w-[280px] flex-col items-center space-y-5">
          <div className="group relative flex h-12 w-12 items-center justify-center rounded-xl border border-primary/10 bg-gradient-to-tr from-primary/15 to-primary/5 shadow-sm">
            {isBlame ? (
              <Eye className="h-6 w-6 text-primary transition-transform duration-300 group-hover:scale-110" />
            ) : (
              <History className="h-6 w-6 text-primary transition-transform duration-300 group-hover:rotate-[-15deg] group-hover:scale-110" />
            )}
            <span className="absolute -right-1 -top-1 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex h-3 w-3 items-center justify-center rounded-full bg-primary text-[6px] font-bold text-primary-foreground">
                ✨
              </span>
            </span>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold tracking-tight text-foreground">
              {isBlame ? 'Git Blame Panel' : 'File History Panel'}
            </h3>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {isBlame
                ? 'Line-by-line commit information, authors, dates, and click-to-open commits will show up here.'
                : 'Timeline of revisions, commit list modifying this file, and interactive diff selectors.'}
            </p>
          </div>

          <div className="flex w-full flex-col items-center space-y-1 pt-2">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[9px] font-medium text-primary">
              <span className="h-1 w-1 animate-pulse rounded-full bg-primary" />
              Coming Soon
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
