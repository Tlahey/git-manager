import { useState, useMemo, useRef } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { ScrollArea, ScrollBar, Button, Badge, Spinner } from '@git-manager/ui'
import {
  X,
  ChevronLeft,
  Columns,
  List,
  RotateCcw,
  Plus,
  Minus,
  Copy,
  Check as CheckedIcon
} from 'lucide-react'
import { useFileDiff } from '../../hooks/useFileDiff'
import type { GitDiffLine } from '@git-manager/git-types'
import { stageFile, unstageFile, discardFileChanges } from '../../lib/tauri'
import { cn } from '@git-manager/ui'

interface DiffViewCenterProps {
  repoPath: string
  file: {
    path: string
    staged: boolean
    oid?: string // defined if reviewing a historic commit
  }
  onClose: () => void
  onRefresh?: () => void
}

// ── Hunk side-by-side alignment algorithm ────────────────────────────────────

interface AlignedDiffRow {
  left: GitDiffLine | null
  right: GitDiffLine | null
}

function alignHunkLines(lines: GitDiffLine[]): AlignedDiffRow[] {
  const rows: AlignedDiffRow[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (line.origin === ' ') {
      rows.push({ left: line, right: line })
      i++
    } else {
      // Collect consecutive deletes (-) and additions (+)
      const deletes: GitDiffLine[] = []
      const additions: GitDiffLine[] = []

      while (i < lines.length && lines[i].origin !== ' ') {
        const current = lines[i]
        if (current.origin === '-') {
          deletes.push(current)
        } else if (current.origin === '+') {
          additions.push(current)
        } else {
          // '\' or other helper lines
          deletes.push(current)
          additions.push(current)
        }
        i++
      }

      const maxLen = Math.max(deletes.length, additions.length)
      for (let j = 0; j < maxLen; j++) {
        rows.push({
          left: deletes[j] || null,
          right: additions[j] || null
        })
      }
    }
  }

  return rows
}

// ── Lightweight Regex Syntax Highlighter ─────────────────────────────────────

function highlightCode(code: string): string {
  if (!code) return '&nbsp;'

  // Escape HTML characters
  let escaped = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // 1. Comments: // ... or /* ... */
  escaped = escaped.replace(/(\/\/.*)/g, '<span class="text-muted-foreground/60 italic">$1</span>')

  // 2. Strings: double quotes, single quotes, backticks
  escaped = escaped.replace(
    /(["'`])(.*?)\1/g,
    '<span class="text-amber-300">$1$2$1</span>'
  )

  // 3. Keywords
  const keywords = /\b(const|let|var|function|return|export|import|from|default|class|extends|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|new|this|typeof|instanceof|async|await|yield|public|private|protected|interface|type|as|any|string|number|boolean|void|null|undefined|true|false)\b/g
  escaped = escaped.replace(
    keywords,
    '<span class="text-purple-400 font-medium">$1</span>'
  )

  // 4. Numbers
  escaped = escaped.replace(/\b(\d+)\b/g, '<span class="text-orange-400">$1</span>')

  return escaped
}

export function DiffViewCenter({
  repoPath,
  file,
  onClose,
  onRefresh
}: DiffViewCenterProps) {
  const { t } = useTranslation('git')
  const [viewMode, setViewMode] = useState<'inline' | 'split'>('split')
  const [copied, setCopied] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  const codeContainerRef = useRef<HTMLDivElement>(null)
  const [leftWidthPercent, setLeftWidthPercent] = useState(50)
  const isResizing = useRef(false)

  function handleResizeStart(e: React.PointerEvent) {
    e.preventDefault()
    isResizing.current = true
    document.body.style.cursor = 'col-resize'
  }

  function handleResizeMove(e: React.PointerEvent) {
    if (!isResizing.current || !codeContainerRef.current) return
    const rect = codeContainerRef.current.getBoundingClientRect()
    const offsetX = e.clientX - rect.left
    const percent = Math.max(15, Math.min(85, (offsetX / rect.width) * 100))
    setLeftWidthPercent(percent)
  }

  function handleResizeEnd() {
    if (isResizing.current) {
      isResizing.current = false
      document.body.style.cursor = ''
    }
  }

  // Use hook to fetch diff
  const { data: diffData, isLoading, refetch } = useFileDiff(
    repoPath,
    file.path,
    file.staged
  )

  const isWip = !file.oid

  const displayPath = useMemo(() => {
    if (!diffData) return file.path
    return diffData.status === 'renamed'
      ? `${diffData.oldPath} → ${diffData.newPath}`
      : diffData.newPath || diffData.oldPath
  }, [diffData, file.path])

  async function handleCopyPath() {
    await navigator.clipboard.writeText(file.path)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  // Toggle stage / unstage
  async function handleToggleStage() {
    setIsProcessing(true)
    try {
      if (file.staged) {
        await unstageFile(repoPath, file.path)
      } else {
        await stageFile(repoPath, file.path)
      }
      refetch()
      onRefresh?.()
    } catch (err) {
      alert(String(err))
    } finally {
      setIsProcessing(false)
    }
  }

  // Rollback file changes
  async function handleRollback() {
    const ok = window.confirm(t('commitDetails.discardPrompt'))
    if (ok) {
      setIsProcessing(true)
      try {
        await discardFileChanges(repoPath, file.path)
        onClose()
        onRefresh?.()
      } catch (err) {
        alert(String(err))
      } finally {
        setIsProcessing(false)
      }
    }
  }

  const STATUS_LABELS: Record<string, string> = {
    added: 'Added',
    modified: 'Modified',
    deleted: 'Deleted',
    renamed: 'Renamed',
    copied: 'Copied',
    typechange: 'Typechange',
    untracked: 'Untracked'
  }

  const STATUS_VARIANTS: Record<string, 'success' | 'destructive' | 'secondary' | 'warning'> = {
    added: 'success',
    modified: 'secondary',
    deleted: 'destructive',
    renamed: 'warning',
    copied: 'success',
    typechange: 'secondary',
    untracked: 'secondary'
  }

  return (
    <div
      className="flex h-full w-full flex-col bg-background overflow-hidden animate-in fade-in zoom-in-95 duration-100 select-none"
      onPointerMove={handleResizeMove}
      onPointerUp={handleResizeEnd}
      onPointerLeave={handleResizeEnd}
    >
      {/* ── CENTRAL DIFF BANNER/HEADER ────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3 shrink-0 shadow-sm">
        {/* Left Side: Back button + File info */}
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-accent shrink-0"
            onClick={onClose}
            title="Back to graph"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>

          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-foreground truncate select-all">
                {displayPath}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 hover:bg-accent shrink-0"
                onClick={handleCopyPath}
                title="Copy path"
              >
                {copied ? (
                  <CheckedIcon className="h-3 w-3 text-green-400" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
            </div>

            {diffData && (
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5 font-medium">
                <Badge variant={STATUS_VARIANTS[diffData.status] ?? 'secondary'} className="text-[9px] px-1 py-0 select-none">
                  {STATUS_LABELS[diffData.status] ?? diffData.status}
                </Badge>
                {!diffData.isBinary && (
                  <span>
                    <span className="text-green-500">+{diffData.additions}</span>
                    {' '}
                    <span className="text-red-500">-{diffData.deletions}</span>
                  </span>
                )}
                {isWip && (
                  <Badge variant={file.staged ? 'success' : 'secondary'} className="text-[9px] px-1 py-0 select-none">
                    {file.staged ? 'Staged' : 'Unstaged'}
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Diff toggle + Stage/Rollback Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Unified/Split Toggle */}
          <div className="flex items-center border border-border rounded overflow-hidden mr-2">
            <Button
              variant={viewMode === 'inline' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 px-2.5 gap-1 text-[10px] font-bold rounded-none"
              onClick={() => setViewMode('inline')}
            >
              <List className="h-3.5 w-3.5" />
              <span>{t('commitDetails.diffInline')}</span>
            </Button>
            <Button
              variant={viewMode === 'split' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 px-2.5 gap-1 text-[10px] font-bold rounded-none"
              onClick={() => setViewMode('split')}
            >
              <Columns className="h-3.5 w-3.5" />
              <span>{t('commitDetails.diffSplit')}</span>
            </Button>
          </div>

          {/* WIP Action buttons */}
          {isWip && diffData && (
            <>
              <Button
                variant={file.staged ? 'outline' : 'default'}
                size="sm"
                className="h-7 px-3 text-[10px] font-bold gap-1"
                onClick={handleToggleStage}
                disabled={isProcessing}
              >
                {file.staged ? (
                  <>
                    <Minus className="h-3.5 w-3.5" />
                    Unstage
                  </>
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5" />
                    Stage File
                  </>
                )}
              </Button>

              <Button
                variant="destructive"
                size="sm"
                className="h-7 px-3 text-[10px] font-bold gap-1 hover:bg-destructive/90"
                onClick={handleRollback}
                disabled={isProcessing}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Discard
              </Button>
            </>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-accent ml-1"
            onClick={onClose}
            title="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── DIFF CONTENT AREA ─────────────────────────────────────────────────── */}
      <ScrollArea className="flex-1 bg-card/45 select-text font-mono text-xs">
        {isLoading && (
          <div className="flex h-40 w-full items-center justify-center">
            <Spinner className="h-5 w-5 text-muted-foreground mr-2" />
            <span className="text-muted-foreground">Loading diff…</span>
          </div>
        )}

        {!isLoading && !diffData && (
          <div className="flex h-40 w-full items-center justify-center text-muted-foreground">
            No difference data found.
          </div>
        )}

        {!isLoading && diffData && (
          <div className="p-4">
            {diffData.isBinary ? (
              <div className="rounded-lg border border-border bg-muted/20 px-4 py-8 text-center text-muted-foreground italic">
                Binary file diff content cannot be displayed.
              </div>
            ) : (
              <div ref={codeContainerRef} className="relative rounded-lg border border-border/80 bg-background overflow-hidden min-w-[800px] w-full">
                {/* Split View Header: Before / After labels */}
                {viewMode === 'split' && (
                  <div className="flex items-stretch border-b border-border bg-muted/30 select-none text-[10px] uppercase font-bold tracking-wider text-muted-foreground sticky top-0 z-20 divide-x divide-border/30">
                    <div
                      className="px-4 py-2 flex items-center justify-between"
                      style={{ width: `${leftWidthPercent}%` }}
                    >
                      <span>Avant / Before (Original)</span>
                      <Badge variant="destructive" className="text-[8px] py-0 px-1 font-bold">OLD</Badge>
                    </div>
                    <div
                      className="px-4 py-2 flex items-center justify-between"
                      style={{ width: `${100 - leftWidthPercent}%` }}
                    >
                      <span>Après / After (Modified)</span>
                      <Badge variant="success" className="text-[8px] py-0 px-1 font-bold">NEW</Badge>
                    </div>
                  </div>
                )}
                {diffData.hunks.map((hunk, hi) => {
                  const alignedRows = alignHunkLines(hunk.lines)

                  return (
                    <div key={hi} className="border-b border-border/40 last:border-b-0">
                      {/* Hunk Header */}
                      <div className="px-3 py-1 bg-blue-500/5 text-blue-400/80 text-[10px] border-b border-border/30 select-none select-none tracking-tight">
                        {hunk.header}
                      </div>

                      {/* Unified (Inline) Render */}
                      {viewMode === 'inline' && (
                        <div className="divide-y divide-border/10">
                          {hunk.lines.map((line, li) => {
                            const isAdded = line.origin === '+'
                            const isDeleted = line.origin === '-'
                            const isUnchanged = line.origin === ' '

                            return (
                              <div
                                key={li}
                                className={cn(
                                  'flex items-stretch leading-5 min-h-[20px]',
                                  isAdded && 'bg-green-500/10 text-green-300 hover:bg-green-500/15',
                                  isDeleted && 'bg-red-500/10 text-red-300 hover:bg-red-500/15'
                                )}
                              >
                                {/* Old Line No */}
                                <span className="w-11 shrink-0 text-right pr-2.5 text-muted-foreground/40 select-none border-r border-border/25 py-0.5">
                                  {line.oldLineno ?? ''}
                                </span>
                                {/* New Line No */}
                                <span className="w-11 shrink-0 text-right pr-2.5 text-muted-foreground/40 select-none border-r border-border/25 py-0.5">
                                  {line.newLineno ?? ''}
                                </span>
                                {/* Origin mark */}
                                <span
                                  className={cn(
                                    'w-6 shrink-0 text-center select-none py-0.5 border-r border-border/10',
                                    isAdded && 'text-green-400 font-bold',
                                    isDeleted && 'text-red-400 font-bold',
                                    isUnchanged && 'text-muted-foreground/20'
                                  )}
                                >
                                  {line.origin === ' ' ? '' : line.origin}
                                </span>
                                {/* Code content */}
                                <pre
                                  className="flex-1 whitespace-pre pl-3 pr-2 py-0.5 overflow-hidden text-[11px] leading-tight font-mono select-text"
                                  dangerouslySetInnerHTML={{
                                    __html: highlightCode(line.content)
                                  }}
                                />
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* Side-by-Side (Split) Render */}
                      {viewMode === 'split' && (
                        <div className="flex flex-col divide-y divide-border/10">
                          {alignedRows.map((row, ri) => {
                            const left = row.left
                            const right = row.right

                            const leftDeleted = left?.origin === '-'
                            const rightAdded = right?.origin === '+'

                            return (
                              <div key={ri} className="flex items-stretch divide-x divide-border/30">
                                {/* LEFT COLUMN (OLD FILE / DELETIONS) */}
                                <div
                                  className={cn(
                                    'flex items-stretch leading-5 min-h-[20px] min-w-0 overflow-hidden',
                                    leftDeleted && 'bg-red-500/10 text-red-300',
                                    !left && 'bg-muted/15 select-none pointer-events-none'
                                  )}
                                  style={{ width: `${leftWidthPercent}%` }}
                                >
                                  <span className="w-11 shrink-0 text-right pr-2 text-muted-foreground/40 select-none border-r border-border/25 py-0.5">
                                    {left?.oldLineno ?? ''}
                                  </span>
                                  <span
                                    className={cn(
                                      'w-5 shrink-0 text-center select-none py-0.5 border-r border-border/10',
                                      leftDeleted && 'text-red-400 font-bold'
                                    )}
                                  >
                                    {leftDeleted ? '-' : ''}
                                  </span>
                                  <pre
                                    className="flex-1 whitespace-pre pl-3 pr-2 py-0.5 overflow-hidden text-[11px] leading-tight font-mono select-text"
                                    dangerouslySetInnerHTML={{
                                      __html: left ? highlightCode(left.content) : ''
                                    }}
                                  />
                                </div>

                                {/* RIGHT COLUMN (NEW FILE / ADDITIONS) */}
                                <div
                                  className={cn(
                                    'flex items-stretch leading-5 min-h-[20px] min-w-0 overflow-hidden',
                                    rightAdded && 'bg-green-500/10 text-green-300',
                                    !right && 'bg-muted/15 select-none pointer-events-none'
                                  )}
                                  style={{ width: `${100 - leftWidthPercent}%` }}
                                >
                                  <span className="w-11 shrink-0 text-right pr-2 text-muted-foreground/40 select-none border-r border-border/25 py-0.5">
                                    {right?.newLineno ?? ''}
                                  </span>
                                  <span
                                    className={cn(
                                      'w-5 shrink-0 text-center select-none py-0.5 border-r border-border/10',
                                      rightAdded && 'text-green-400 font-bold'
                                    )}
                                  >
                                    {rightAdded ? '+' : ''}
                                  </span>
                                  <pre
                                    className="flex-1 whitespace-pre pl-3 pr-2 py-0.5 overflow-hidden text-[11px] leading-tight font-mono select-text"
                                    dangerouslySetInnerHTML={{
                                      __html: right ? highlightCode(right.content) : ''
                                    }}
                                  />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
                {/* Vertical resize handle */}
                {viewMode === 'split' && (
                  <div
                    onPointerDown={handleResizeStart}
                    className="absolute inset-y-0 w-2.5 -ml-1.25 cursor-col-resize z-30 group"
                    style={{ left: `${leftWidthPercent}%` }}
                  >
                    <div className="w-0.5 h-full bg-border/60 group-hover:bg-primary/80 group-hover:w-[3px] transition-all mx-auto" />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  )
}
