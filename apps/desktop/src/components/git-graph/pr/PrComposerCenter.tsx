import { useTranslation } from '@git-manager/i18n'
import { X, GitPullRequest } from 'lucide-react'
import { usePrPublishFlow } from '../../../hooks/usePrPublishFlow'
import { PrComposerExpander } from './PrComposerExpander'

interface PrComposerCenterProps {
  repoPath: string
}

/**
 * Center-panel takeover for composing the PR after "ship from here" has made the commit. It lives
 * here — not in the WIP staging column that triggered it — because committing clears the working
 * tree, which unmounts that column; the flow state is held in `repoUI.store`'s `prComposer` so the
 * composer survives (see {@link usePrPublishFlow}). Rendered by `GitGraph` when `prComposer` is set.
 */
export function PrComposerCenter({ repoPath }: PrComposerCenterProps) {
  const { t } = useTranslation('git')
  const flow = usePrPublishFlow(repoPath)

  // Nothing prepared → GitGraph shouldn't have rendered us; render nothing rather than an empty box.
  if (!flow.composer) return null

  return (
    <div className="flex h-full flex-col overflow-hidden" data-testid="pr-composer-center">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <GitPullRequest className="h-4 w-4 text-primary" />
          {t('pr.publish.composerTitle')}
        </div>
        <button
          onClick={flow.cancel}
          disabled={flow.busy}
          className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-50"
          data-testid="pr-composer-close"
          title={t('pr.publish.cancel')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-2xl">
          <PrComposerExpander
            repoPath={repoPath}
            defaultTitle={flow.composer.title}
            defaultBaseRef={flow.defaultBaseRef}
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
