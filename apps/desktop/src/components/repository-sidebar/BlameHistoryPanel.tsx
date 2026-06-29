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
  const fileDir = file && file.path.includes('/')
    ? file.path.substring(0, file.path.lastIndexOf('/') + 1)
    : ''

  return (
    <div className="flex h-full w-full flex-col bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-muted/20 px-4 py-3 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {isBlame ? (
            <Eye className="h-4 w-4 text-primary shrink-0 animate-pulse" />
          ) : (
            <History className="h-4 w-4 text-primary shrink-0" />
          )}
          <h2 className="text-xs font-semibold text-foreground truncate select-none">
            {isBlame ? 'Git Blame' : 'File History'}
          </h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 hover:bg-accent shrink-0"
          onClick={onClose}
          title="Close panel"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* File Info Banner */}
      {file && (
        <div className="px-4 py-2 border-b border-border/50 bg-muted/10 shrink-0 select-none">
          <div className="flex flex-col min-w-0">
            {fileDir && (
              <span className="font-mono text-[9px] text-muted-foreground/60 truncate leading-none mb-0.5 animate-in fade-in duration-200">
                {fileDir}
              </span>
            )}
            <span className="font-mono text-xs text-foreground font-medium truncate animate-in fade-in duration-250">
              {fileName}
            </span>
          </div>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 relative flex flex-col items-center justify-center p-6 text-center select-none overflow-y-auto bg-gradient-to-b from-card to-background">
        {/* Glow decorative background */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full bg-primary/5 blur-[50px] pointer-events-none" />

        <div className="z-10 max-w-[280px] w-full flex flex-col items-center space-y-5">
          <div className="relative flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-tr from-primary/15 to-primary/5 border border-primary/10 shadow-sm group">
            {isBlame ? (
              <Eye className="w-6 h-6 text-primary transition-transform duration-300 group-hover:scale-110" />
            ) : (
              <History className="w-6 h-6 text-primary transition-transform duration-300 group-hover:rotate-[-15deg] group-hover:scale-110" />
            )}
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-primary text-[6px] font-bold text-primary-foreground items-center justify-center">✨</span>
            </span>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold tracking-tight text-foreground">
              {isBlame ? 'Git Blame Panel' : 'File History Panel'}
            </h3>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {isBlame
                ? 'Line-by-line commit information, authors, dates, and click-to-open commits will show up here.'
                : 'Timeline of revisions, commit list modifying this file, and interactive diff selectors.'
              }
            </p>
          </div>

          <div className="flex flex-col items-center space-y-1 w-full pt-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-medium bg-primary/10 text-primary border border-primary/20">
              <span className="w-1 h-1 rounded-full bg-primary animate-pulse" />
              Coming Soon
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
