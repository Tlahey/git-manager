import { useTranslation } from '@git-manager/i18n'
import type { GhRawPR } from '../../../api/github.api'
import { usePrMergeability } from '../../../hooks/usePrMergeability'
import { prStateKind, prStateVisual } from './prState'
import { PrChecksBox } from './PrChecksBox'
import { PrMergeButton } from './PrMergeButton'

interface PrMergePanelProps {
  repoPath: string
  prNumber: number
  pr: GhRawPR
}

/** The "merge box": current PR state (icon + label), the GitHub-style checks/review/mergeability
 * rollup, then the merge control. Groups everything needed to decide whether to merge. */
export function PrMergePanel({ repoPath, prNumber, pr }: PrMergePanelProps) {
  const { t } = useTranslation('git')
  const { mergeability, isLoading } = usePrMergeability(repoPath, prNumber, pr.head?.sha ?? null)
  const kind = prStateKind(pr)
  const visual = prStateVisual(kind)
  const Icon = visual.icon
  const inMergeQueue = pr.mergeable_state === 'queued'

  return (
    <section data-testid="pr-merge-panel" className="border-t border-border">
      <div className="flex items-center gap-2 px-4 py-3">
        <Icon className={`h-4 w-4 ${visual.iconClassName}`} />
        <span className="text-xs font-medium text-foreground">
          {t(inMergeQueue ? 'pr.merge.stateQueued' : visual.labelKey)}
        </span>
      </div>

      <div className="border-t border-border">
        <PrChecksBox
          repoPath={repoPath}
          prNumber={prNumber}
          pr={pr}
          mergeability={mergeability}
          isLoading={isLoading}
        />
      </div>

      <PrMergeButton
        repoPath={repoPath}
        prNumber={prNumber}
        mergeState={mergeability?.mergeStateStatus ?? 'UNKNOWN'}
        prState={pr.state}
        isDraft={pr.draft}
        merged={!!pr.merged_at}
        mergeable={pr.mergeable}
      />
    </section>
  )
}
