import { useTranslation } from '@git-manager/i18n'
import { Button, Spinner } from '@git-manager/ui'
import { FileEdit, GitPullRequestDraft, XCircle, RotateCcw } from 'lucide-react'
import type { GhRawPR } from '../../../api/github.api'
import { usePrActions } from '../../../hooks/usePrActions'

interface PrStateActionsProps {
  repoPath: string
  prNumber: number
  pr: GhRawPR
}

/** Bottom-of-panel PR lifecycle actions: convert to draft / mark ready, and close / reopen. Hidden
 * once the PR is merged (terminal state). The draft toggle needs the PR's GraphQL `node_id`. */
export function PrStateActions({ repoPath, prNumber, pr }: PrStateActionsProps) {
  const { t } = useTranslation('git')
  const { setState, toggleDraft, pending } = usePrActions(repoPath, prNumber)

  if (pr.merged_at) return null

  const isOpen = pr.state === 'open'
  const canToggleDraft = isOpen && !!pr.node_id

  return (
    <section data-testid="pr-state-actions" className="space-y-1.5 px-3 py-2.5">
      {canToggleDraft &&
        (pr.draft ? (
          <Button
            variant="outline"
            size="sm"
            data-testid="pr-mark-ready"
            className="h-8 w-full justify-start gap-2 text-xs"
            disabled={pending}
            onClick={() => toggleDraft(pr.node_id as string, false)}
          >
            {pending ? <Spinner className="h-3.5 w-3.5" /> : <FileEdit className="h-3.5 w-3.5" />}
            {t('pr.actions.markReady')}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            data-testid="pr-convert-draft"
            className="h-8 w-full justify-start gap-2 text-xs"
            disabled={pending}
            onClick={() => toggleDraft(pr.node_id as string, true)}
          >
            <GitPullRequestDraft className="h-3.5 w-3.5" />
            {t('pr.actions.convertToDraft')}
          </Button>
        ))}

      {isOpen ? (
        <Button
          variant="outline"
          size="sm"
          data-testid="pr-close"
          className="h-8 w-full justify-start gap-2 text-xs text-destructive hover:text-destructive"
          disabled={pending}
          onClick={() => setState('closed')}
        >
          <XCircle className="h-3.5 w-3.5" />
          {t('pr.actions.close')}
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          data-testid="pr-reopen"
          className="h-8 w-full justify-start gap-2 text-xs"
          disabled={pending}
          onClick={() => setState('open')}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {t('pr.actions.reopen')}
        </Button>
      )}
    </section>
  )
}
