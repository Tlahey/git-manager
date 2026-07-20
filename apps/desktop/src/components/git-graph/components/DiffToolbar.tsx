import { Button, Badge, cn } from '@git-manager/ui'
import {
  X,
  ChevronLeft,
  RotateCcw,
  Plus,
  Minus,
  Copy,
  Check as CheckedIcon,
  GitCompare,
  FileText,
  Eye,
  History,
} from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import type { GitDiffFile } from '@git-manager/git-types'

const STATUS_LABEL_KEYS: Record<string, string> = {
  added: 'diffToolbar.status.added',
  modified: 'diffToolbar.status.modified',
  deleted: 'diffToolbar.status.deleted',
  renamed: 'diffToolbar.status.renamed',
  copied: 'diffToolbar.status.copied',
  typechange: 'diffToolbar.status.typechange',
  untracked: 'diffToolbar.status.untracked',
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
  isProcessing: boolean
  onToggleStage: () => void
  onRollback: () => void
}

/**
 * Header/toolbar for `DiffViewCenter`: file identity + status, diff/file view tabs, blame/history
 * toggle, and WIP stage/discard actions. Diff-viewing controls (change navigation, whitespace,
 * collapse-unchanged) live in `ConflictResolver`'s own header now that the diff tab renders
 * through `@git-manager/editor`'s `ThreeWayMergeEditor` instead of a raw Monaco diff editor.
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
          title={t('actions.backToGraph')}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>

        <div className="flex min-w-0 flex-col">
          {parsedPath.dir && (
            <span
              data-testid="diff-header-path"
              className="mb-0.5 select-none truncate font-mono text-[10px] leading-none text-muted-foreground"
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
              title={t('actions.copyPath')}
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
                {diffData.status in STATUS_LABEL_KEYS
                  ? t(STATUS_LABEL_KEYS[diffData.status])
                  : diffData.status}
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
                  {file.staged ? t('diffToolbar.staged') : t('diffToolbar.unstaged')}
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Center: View mode tabs (Diff, File) */}
      <div className="mx-4 flex shrink-0 items-center rounded-lg border border-border/50 bg-muted/60 p-0.5">
        <button
          data-testid="diff-tab-diff"
          onClick={() => onChangeActiveTab('diff')}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-4 py-1 text-xs font-medium transition-all duration-200',
            activeTab === 'diff'
              ? 'border-b border-border/10 bg-background font-semibold text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <GitCompare className="h-3.5 w-3.5" />
          <span>{t('diffToolbar.tabDiff')}</span>
        </button>
        <button
          data-testid="diff-tab-file"
          onClick={() => onChangeActiveTab('file')}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-4 py-1 text-xs font-medium transition-all duration-200',
            activeTab === 'file'
              ? 'border-b border-border/10 bg-background font-semibold text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <FileText className="h-3.5 w-3.5" />
          <span>{t('diffToolbar.tabFile')}</span>
        </button>
      </div>

      {/* Right Side: Diff toggle + Stage/Rollback Actions */}
      <div className="flex shrink-0 items-center gap-2">
        {/* Blame & History Toggles */}
        <div className="mr-2 flex items-center overflow-hidden rounded border border-border bg-card">
          <Button
            data-testid="diff-blame-toggle"
            variant={activeLeftPanel === 'blame' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 gap-1 rounded-none border-r border-border px-2.5 text-[10px] font-bold"
            onClick={() =>
              onChangeActiveLeftPanel(activeLeftPanel === 'blame' ? 'sidebar' : 'blame')
            }
            title={t('diffToolbar.blameTitle')}
          >
            <Eye className="h-3.5 w-3.5" />
            <span>{t('diffToolbar.blame')}</span>
          </Button>
          <Button
            data-testid="diff-history-toggle"
            variant={activeLeftPanel === 'history' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 gap-1 rounded-none px-2.5 text-[10px] font-bold"
            onClick={() =>
              onChangeActiveLeftPanel(activeLeftPanel === 'history' ? 'sidebar' : 'history')
            }
            title={t('diffToolbar.historyTitle')}
          >
            <History className="h-3.5 w-3.5" />
            <span>{t('diffToolbar.history')}</span>
          </Button>
        </div>

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
                  {t('diffToolbar.unstage')}
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" />
                  {t('diffToolbar.stageFile')}
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
              {t('diffToolbar.discard')}
            </Button>
          </>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="ml-1 h-8 w-8 hover:bg-accent"
          onClick={onClose}
          title={t('actions.close')}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
