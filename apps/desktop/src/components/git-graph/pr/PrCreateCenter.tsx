import { useTranslation } from '@git-manager/i18n'
import { X, GitPullRequest } from 'lucide-react'
import { usePrCreateFlow } from '../../../hooks/usePrCreateFlow'
import { PrCreateForm } from './PrCreateForm'

interface PrCreateCenterProps {
  repoPath: string
}

/**
 * Center-panel takeover for creating a pull request from scratch, opened by the sidebar "Pull
 * Requests" section's "+" button. Rendered by `GitGraph` when `repoUI.store`'s `prCreateOpen` is
 * set. Holds the create flow; delegates the form to {@link PrCreateForm}.
 */
export function PrCreateCenter({ repoPath }: PrCreateCenterProps) {
  const { t } = useTranslation('git')
  const flow = usePrCreateFlow(repoPath)

  return (
    <div className="flex h-full flex-col overflow-hidden" data-testid="pr-create-center">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <GitPullRequest className="h-4 w-4 text-primary" />
          {t('pr.create.title')}
        </div>
        <button
          onClick={flow.cancel}
          disabled={flow.busy}
          className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-50"
          data-testid="pr-create-close"
          title={t('pr.publish.cancel')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-2xl">
          <PrCreateForm
            repoPath={repoPath}
            currentBranch={flow.currentBranch}
            defaultBase={flow.defaultBase}
            isSubmitting={flow.busy}
            error={flow.error}
            onCreate={(input) => void flow.createPr(input).catch(() => {})}
            onCancel={flow.cancel}
          />
        </div>
      </div>
    </div>
  )
}
