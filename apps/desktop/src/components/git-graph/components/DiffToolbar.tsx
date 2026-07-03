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
  isProcessing,
  onToggleStage,
  onRollback,
}: DiffToolbarProps) {
  const { t } = useTranslation('git')

  return (
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
          {parsedPath.dir && (
            <span data-testid="diff-header-path" className="font-mono text-[10px] text-muted-foreground/60 truncate select-none leading-none mb-0.5">
              {parsedPath.dir}
            </span>
          )}
          <div className="flex items-center gap-2">
            <span data-testid="diff-header-name" className="font-mono text-xs text-foreground truncate select-all leading-tight">
              {parsedPath.name}
            </span>
            <Button
              data-testid="diff-copy-path-btn"
              variant="ghost"
              size="icon"
              className="h-5 w-5 hover:bg-accent shrink-0"
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

      {/* Center: View mode tabs (Diff, File) */}
      <div className="flex items-center bg-muted/60 p-0.5 rounded-lg border border-border/50 shrink-0 mx-4">
        <button
          onClick={() => onChangeActiveTab('diff')}
          className={cn(
            "px-4 py-1 text-xs font-medium rounded-md transition-all duration-200 flex items-center gap-1.5",
            activeTab === 'diff'
              ? "bg-background text-foreground shadow-sm font-semibold border-b border-border/10"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <GitCompare className="h-3.5 w-3.5" />
          <span>Diff</span>
        </button>
        <button
          onClick={() => onChangeActiveTab('file')}
          className={cn(
            "px-4 py-1 text-xs font-medium rounded-md transition-all duration-200 flex items-center gap-1.5",
            activeTab === 'file'
              ? "bg-background text-foreground shadow-sm font-semibold border-b border-border/10"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <FileText className="h-3.5 w-3.5" />
          <span>File</span>
        </button>
      </div>

      {/* Right Side: Diff toggle + Stage/Rollback Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Blame & History Toggles */}
        <div className="flex items-center border border-border rounded bg-card overflow-hidden mr-2">
          <Button
            variant={activeLeftPanel === 'blame' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 px-2.5 gap-1 text-[10px] font-bold rounded-none border-r border-border"
            onClick={() => onChangeActiveLeftPanel(activeLeftPanel === 'blame' ? 'sidebar' : 'blame')}
            title="Git Blame"
          >
            <Eye className="h-3.5 w-3.5" />
            <span>Blame</span>
          </Button>
          <Button
            variant={activeLeftPanel === 'history' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 px-2.5 gap-1 text-[10px] font-bold rounded-none"
            onClick={() => onChangeActiveLeftPanel(activeLeftPanel === 'history' ? 'sidebar' : 'history')}
            title="File History"
          >
            <History className="h-3.5 w-3.5" />
            <span>History</span>
          </Button>
        </div>

        {/* Unified/Split Toggle & Change Navigation (only in Diff view) */}
        {activeTab === 'diff' && (
          <div className="flex items-center gap-2 mr-2 animate-in fade-in slide-in-from-right-1 duration-150">
            <div className="flex items-center border border-border rounded overflow-hidden">
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

            <div className="flex items-center border border-border rounded overflow-hidden">
              <Button
                variant={viewMode === 'inline' ? 'default' : 'ghost'}
                size="sm"
                className="h-7 px-2.5 gap-1 text-[10px] font-bold rounded-none border-r border-border"
                onClick={() => onChangeViewMode('inline')}
              >
                <List className="h-3.5 w-3.5" />
                <span>{t('commitDetails.diffInline')}</span>
              </Button>
              <Button
                variant={viewMode === 'split' ? 'default' : 'ghost'}
                size="sm"
                className="h-7 px-2.5 gap-1 text-[10px] font-bold rounded-none"
                onClick={() => onChangeViewMode('split')}
              >
                <Columns className="h-3.5 w-3.5" />
                <span>{t('commitDetails.diffSplit')}</span>
              </Button>
            </div>

            <Button
              variant={ignoreWhitespace ? 'default' : 'outline'}
              size="sm"
              className="h-7 px-2.5 text-[10px] font-bold shrink-0 ml-2"
              onClick={onToggleIgnoreWhitespace}
              title="Ignore trim whitespace in diff"
            >
              Hide Whitespace
            </Button>
          </div>
        )}

        {/* WIP Action buttons */}
        {isWip && diffData && (
          <>
            <Button
              variant={file.staged ? 'outline' : 'default'}
              size="sm"
              className="h-7 px-3 text-[10px] font-bold gap-1"
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
              className="h-7 px-3 text-[10px] font-bold gap-1 hover:bg-destructive/90"
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
          className="h-8 w-8 hover:bg-accent ml-1"
          onClick={onClose}
          title="Close"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
