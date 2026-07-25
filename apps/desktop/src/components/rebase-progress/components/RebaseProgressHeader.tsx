import { EyeOff, Files, GitBranch, MoveRight, RefreshCw } from 'lucide-react'
import { Badge, Button, Tag } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import type { RebaseState } from '@git-manager/git-types'

/** i18n key describing what the rebase is currently doing, per `RebaseState.kind`. */
const KIND_LABELS: Record<string, string> = {
  conflict: 'rebaseProgress.statusConflict',
  edit_pause: 'rebaseProgress.statusEditPause',
  in_progress: 'rebaseProgress.statusRunning',
}

interface RebaseProgressHeaderProps {
  rebaseState: RebaseState
  /** Step counter to display — resolved by the caller, which can count steps itself. */
  currentStep?: number
  totalSteps?: number
  /** Whether the right-hand conflicted-files panel is currently up. */
  filesPanelOpen?: boolean
  onToggleFilesPanel?: () => void
  onHide: () => void
}

/**
 * Top bar of the rebase progress view: which branch is going onto what, how far along the
 * rebase is, and the control that dismisses the view (the graph's CONFLICT row brings it back).
 */
export function RebaseProgressHeader({
  rebaseState,
  currentStep,
  totalSteps,
  filesPanelOpen,
  onToggleFilesPanel,
  onHide,
}: RebaseProgressHeaderProps) {
  const { t } = useTranslation('git')
  const ontoName = rebaseState.ontoLabel ?? rebaseState.ontoShortOid
  const statusKey = KIND_LABELS[rebaseState.kind]

  return (
    <div
      className="flex shrink-0 flex-col gap-2 border-b border-border bg-card px-4 py-3"
      data-testid="rebase-progress-header"
    >
      <div className="flex items-center gap-2">
        <RefreshCw className="h-4 w-4 shrink-0 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">{t('rebaseProgress.title')}</h2>

        {statusKey && (
          <Badge
            variant={rebaseState.kind === 'conflict' ? 'destructive' : 'warning'}
            className="px-1.5 py-0 text-[9px] uppercase"
            data-testid="rebase-progress-status"
          >
            {t(statusKey)}
          </Badge>
        )}

        <div className="ml-auto flex items-center gap-2">
          {currentStep != null && totalSteps != null && (
            <span
              className="rounded border border-border/40 bg-muted/65 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground"
              data-testid="rebase-progress-counter"
            >
              {t('conflictEditor.stepProgress', { current: currentStep, total: totalSteps })}
            </span>
          )}
          {onToggleFilesPanel && (
            <Button
              variant={filesPanelOpen ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 gap-1 px-2 text-[10px] font-semibold"
              onClick={onToggleFilesPanel}
              aria-pressed={filesPanelOpen}
              title={
                filesPanelOpen
                  ? t('rebaseProgress.hideFilesTitle')
                  : t('rebaseProgress.showFilesTitle')
              }
              data-testid="rebase-progress-toggle-files"
            >
              <Files className="h-3.5 w-3.5" />
              {t('rebaseProgress.files')}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-[10px] font-semibold"
            onClick={onHide}
            title={t('rebaseProgress.hideTitle')}
            data-testid="rebase-progress-hide"
          >
            <EyeOff className="h-3.5 w-3.5" />
            {t('rebaseProgress.hide')}
          </Button>
        </div>
      </div>

      {/* branch → onto: the whole point of the view is knowing which way the replay goes. */}
      <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        <GitBranch className="h-3.5 w-3.5 shrink-0" />
        <Tag className="max-w-[45%] truncate" data-testid="rebase-progress-branch">
          {rebaseState.branchName ?? t('rebaseProgress.unknownBranch')}
        </Tag>
        <MoveRight className="h-3.5 w-3.5 shrink-0" />
        <span className="shrink-0">{t('rebaseProgress.onto')}</span>
        <Tag className="max-w-[45%] truncate" data-testid="rebase-progress-onto">
          {ontoName ?? t('rebaseProgress.unknownOnto')}
        </Tag>
      </div>
    </div>
  )
}
