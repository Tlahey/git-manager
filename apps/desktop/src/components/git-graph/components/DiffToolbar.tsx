import { useTranslation } from '@git-manager/i18n'
import { Button, Badge, cn } from '@git-manager/ui'
import {
  X,
  ChevronLeft,
  Columns,
  List,
  RotateCcw,
  Plus,
  Minus,
  Copy,
  Check as CheckedIcon,
  ChevronUp,
  ChevronDown,
  GitCompare,
  FileText,
  Eye,
  History,
  FoldVertical,
} from 'lucide-react'
import type { GitDiffFile } from '@git-manager/git-types'

const STATUS_LABELS: Record<string, string> = {
  added: 'Added',
  modified: 'Modified',
  deleted: 'Deleted',
  renamed: 'Renamed',
  copied: 'Copied',
  typechange: 'Typechange',
  untracked: 'Untracked',
}

const STATUS_VARIANTS: Record<string, 'success' | 'destructive' | 'secondary' | 'warning'> = {
  added: 'success',
  modified: 'secondary',
  deleted: 'destructive',
  renamed: 'warning',
  copied: 'success',
  typechange: 'secondary',
  untracked: 'secondary',
}

interface DiffToolbarProps {
  parsedPath: { dir: string; name: string }
  diffData: GitDiffFile | undefined
  file: { path: string; staged: boolean; oid?: string }
  isWip: boolean
  copied: boolean
  onCopyPath: () => void
  onClose: () => void
  activeTab: 'diff' | 'file'
  onChangeActiveTab: (tab: 'diff' | 'file') => void
  activeLeftPanel: 'sidebar' | 'blame' | 'history'
  onChangeActiveLeftPanel: (panel: 'sidebar' | 'blame' | 'history') => void
  onPrevChange: () => void
  onNextChange: () => void
  viewMode: 'inline' | 'split'
  onChangeViewMode: (mode: 'inline' | 'split') => void
  ignoreWhitespace: boolean
  onToggleIgnoreWhitespace: () => void
  collapseUnchanged: boolean
  onToggleCollapseUnchanged: () => void
  isProcessing: boolean
  onToggleStage: () => void
  onRollback: () => void
}

/**
 * Header/toolbar for `DiffViewCenter`: file identity + status, diff/file view tabs, blame/history
 * toggle, diff navigation, split/inline + whitespace toggles, and WIP stage/discard actions.
 * Purely presentational — all state and handlers live in `DiffViewCenter`.
 */
export function DiffToolbar({
  parsedPath,
  diffData,
  file,
  isWip,
  copied,
  onCopyPath,
  onClose,
  activeTab,
  onChangeActiveTab,
  activeLeftPanel,
  onChangeActiveLeftPanel,
  onPrevChange,
  onNextChange,
  viewMode,
  onChangeViewMode,
  ignoreWhitespace,
  onToggleIgnoreWhitespace,
  collapseUnchanged,
  onToggleCollapseUnchanged,
  isProcessing,
  onToggleStage,
  onRollback,
}: DiffToolbarProps) {
  const { t } = useTranslation('git')

  return (
    <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-4 py-3 shadow-sm">
      {/* Left Side: Back button + File info */}
      <div className="flex min-w-0 items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 hover:bg-accent"
          onClick={onClose}
          title="Back to graph"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>

        <div className="flex min-w-0 flex-col">
          {parsedPath.dir && (
            <span
              data-testid="diff-header-path"
              className="mb-0.5 select-none truncate font-mono text-[10px] leading-none text-muted-foreground/60"
            >
              {parsedPath.dir}
            </span>
          )}
          <div className="flex items-center gap-2">
            <span
              data-testid="diff-header-name"
              className="select-all truncate font-mono text-xs leading-tight text-foreground"
            >
              {parsedPath.name}
            </span>
            <Button
              data-testid="diff-copy-path-btn"
              variant="ghost"
              size="icon"
              className="h-5 w-5 shrink-0 hover:bg-accent"
              onClick={onCopyPath}
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
            <div className="mt-0.5 flex items-center gap-2 text-[10px] font-medium text-muted-foreground">
              <Badge
                variant={STATUS_VARIANTS[diffData.status] ?? 'secondary'}
                className="select-none px-1 py-0 text-[9px]"
              >
                {STATUS_LABELS[diffData.status] ?? diffData.status}
              </Badge>
              {!diffData.isBinary && (
                <span>
                  <span className="text-green-500">+{diffData.additions}</span>{' '}
                  <span className="text-red-500">-{diffData.deletions}</span>
                </span>
              )}
              {isWip && (
                <Badge
                  variant={file.staged ? 'success' : 'secondary'}
                  className="select-none px-1 py-0 text-[9px]"
                >
                  {file.staged ? 'Staged' : 'Unstaged'}
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Center: View mode tabs (Diff, File) */}
      <div className="mx-4 flex shrink-0 items-center rounded-lg border border-border/50 bg-muted/60 p-0.5">
        <button
          onClick={() => onChangeActiveTab('diff')}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-4 py-1 text-xs font-medium transition-all duration-200',
            activeTab === 'diff'
              ? 'border-b border-border/10 bg-background font-semibold text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <GitCompare className="h-3.5 w-3.5" />
          <span>Diff</span>
        </button>
        <button
          onClick={() => onChangeActiveTab('file')}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-4 py-1 text-xs font-medium transition-all duration-200',
            activeTab === 'file'
              ? 'border-b border-border/10 bg-background font-semibold text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <FileText className="h-3.5 w-3.5" />
          <span>File</span>
        </button>
      </div>

      {/* Right Side: Diff toggle + Stage/Rollback Actions */}
      <div className="flex shrink-0 items-center gap-2">
        {/* Blame & History Toggles */}
        <div className="mr-2 flex items-center overflow-hidden rounded border border-border bg-card">
          <Button
            variant={activeLeftPanel === 'blame' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 gap-1 rounded-none border-r border-border px-2.5 text-[10px] font-bold"
            onClick={() =>
              onChangeActiveLeftPanel(activeLeftPanel === 'blame' ? 'sidebar' : 'blame')
            }
            title="Git Blame"
          >
            <Eye className="h-3.5 w-3.5" />
            <span>Blame</span>
          </Button>
          <Button
            variant={activeLeftPanel === 'history' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 gap-1 rounded-none px-2.5 text-[10px] font-bold"
            onClick={() =>
              onChangeActiveLeftPanel(activeLeftPanel === 'history' ? 'sidebar' : 'history')
            }
            title="File History"
          >
            <History className="h-3.5 w-3.5" />
            <span>History</span>
          </Button>
        </div>

        {/* Unified/Split Toggle & Change Navigation (only in Diff view) */}
        {activeTab === 'diff' && (
          <div className="animate-in fade-in slide-in-from-right-1 mr-2 flex items-center gap-2 duration-150">
            <div className="flex items-center overflow-hidden rounded border border-border">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-none border-r border-border hover:bg-accent"
                onClick={onPrevChange}
                title="Previous Change"
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-none hover:bg-accent"
                onClick={onNextChange}
                title="Next Change"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center overflow-hidden rounded border border-border">
              <Button
                variant={viewMode === 'inline' ? 'default' : 'ghost'}
                size="sm"
                className="h-7 gap-1 rounded-none border-r border-border px-2.5 text-[10px] font-bold"
                onClick={() => onChangeViewMode('inline')}
              >
                <List className="h-3.5 w-3.5" />
                <span>{t('commitDetails.diffInline')}</span>
              </Button>
              <Button
                variant={viewMode === 'split' ? 'default' : 'ghost'}
                size="sm"
                className="h-7 gap-1 rounded-none px-2.5 text-[10px] font-bold"
                onClick={() => onChangeViewMode('split')}
              >
                <Columns className="h-3.5 w-3.5" />
                <span>{t('commitDetails.diffSplit')}</span>
              </Button>
            </div>

            <Button
              variant={ignoreWhitespace ? 'default' : 'outline'}
              size="sm"
              className="ml-2 h-7 shrink-0 px-2.5 text-[10px] font-bold"
              onClick={onToggleIgnoreWhitespace}
              title="Ignore trim whitespace in diff"
            >
              Hide Whitespace
            </Button>

            <Button
              variant={collapseUnchanged ? 'default' : 'outline'}
              size="icon"
              className="ml-2 h-7 w-7 shrink-0"
              onClick={onToggleCollapseUnchanged}
              title={t('commitDetails.collapseUnchanged')}
              data-testid="diff-collapse-unchanged-btn"
            >
              <FoldVertical className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {/* WIP Action buttons */}
        {isWip && diffData && (
          <>
            <Button
              variant={file.staged ? 'outline' : 'default'}
              size="sm"
              className="h-7 gap-1 px-3 text-[10px] font-bold"
              onClick={onToggleStage}
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
              className="h-7 gap-1 px-3 text-[10px] font-bold hover:bg-destructive/90"
              onClick={onRollback}
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
          className="ml-1 h-8 w-8 hover:bg-accent"
          onClick={onClose}
          title="Close"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
