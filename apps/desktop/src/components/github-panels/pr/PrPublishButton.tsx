import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Input } from '@git-manager/ui'
import { GitPullRequest } from 'lucide-react'
import { usePrPublishFlow } from '../../../hooks/usePrPublishFlow'

interface PrPublishButtonProps {
  repoPath: string
  /** The commit message from the panel — used both to commit and to pre-fill the PR title. */
  commitMessage: string
  /** Disabled upstream (e.g. nothing staged / empty message). */
  disabled?: boolean
}

/** Entry point for "ship from here": commit (+ branch on a protected branch), then hand off to the
 * center-panel composer ({@link PrComposerCenter}) to push + open the PR. Renders the right variant
 * for the current branch and drives {@link usePrPublishFlow}. Hidden when the flow is unavailable
 * (non-GitHub repo, signed out, detached HEAD) or a composer is already open. */
export function PrPublishButton({ repoPath, commitMessage, disabled }: PrPublishButtonProps) {
  const { t } = useTranslation('git')
  const flow = usePrPublishFlow(repoPath)
  const [collectingBranch, setCollectingBranch] = useState(false)
  const [branchName, setBranchName] = useState('')

  // The composer has taken over the center panel — don't offer the trigger again.
  if (flow.mode === 'unavailable' || flow.composer) return null

  async function start() {
    if (flow.mode === 'protected') {
      if (!collectingBranch) {
        setCollectingBranch(true)
        return
      }
      await flow
        .commitAndPrepare({ commitMessage, newBranchName: branchName })
        .then(() => {
          setCollectingBranch(false)
          setBranchName('')
        })
        .catch(() => {})
      return
    }
    await flow.commitAndPrepare({ commitMessage }).catch(() => {})
  }

  return (
    <div className="space-y-1.5">
      {flow.mode === 'protected' && collectingBranch && (
        <Input
          autoFocus
          value={branchName}
          onChange={(e) => setBranchName(e.target.value)}
          placeholder={t('pr.publish.branchNamePlaceholder')}
          className="h-8 text-xs"
          data-testid="pr-publish-branch-name"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && branchName.trim()) void start()
          }}
        />
      )}

      <Button
        variant="outline"
        size="sm"
        data-testid="pr-publish-button"
        className="h-8 w-full gap-1.5 text-xs"
        disabled={disabled || flow.busy || (collectingBranch && !branchName.trim())}
        onClick={() => void start()}
      >
        <GitPullRequest className="h-3.5 w-3.5 text-primary" />
        {flow.mode === 'protected' ? t('pr.publish.protected') : t('pr.publish.feature')}
      </Button>

      {flow.error && (
        <p className="text-[11px] text-destructive" data-testid="pr-publish-error">
          {flow.error}
        </p>
      )}
    </div>
  )
}
