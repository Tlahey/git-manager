import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Spinner } from '@git-manager/ui'
import { GitMerge } from 'lucide-react'
import type { MergeMethod, PrMergeStateStatus } from '../../../api/github.api'
import { usePrActions } from '../../../hooks/usePrActions'

interface PrMergeButtonProps {
  repoPath: string
  prNumber: number
  /** GitHub's merge-state status — gates the button the same way github.com's merge box does. */
  mergeState: PrMergeStateStatus
  prState: string
  isDraft: boolean
  merged: boolean
  mergeable?: boolean | null
}

/** States in which GitHub lets you merge: clean, or with only non-required checks failing / repo
 * hooks pending. Everything else (behind, blocked, dirty, draft, unknown) disables the button. */
const MERGEABLE_STATES: PrMergeStateStatus[] = ['CLEAN', 'UNSTABLE', 'HAS_HOOKS']

/** "Merge pull request" with a merge-method chooser, gated on GitHub's `mergeStateStatus`. */
export function PrMergeButton({
  repoPath,
  prNumber,
  mergeState,
  prState,
  isDraft,
  merged,
  mergeable,
}: PrMergeButtonProps) {
  const { t } = useTranslation('git')
  const { merge, pending } = usePrActions(repoPath, prNumber)
  // Default to a merge commit, matching GitHub's own default order in the dropdown.
  const [method, setMethod] = useState<MergeMethod>('merge')

  const methodDescKey: Record<MergeMethod, string> = {
    merge: 'pr.merge.methodMergeDesc',
    squash: 'pr.merge.methodSquashDesc',
    rebase: 'pr.merge.methodRebaseDesc',
  }

  if (merged) {
    return (
      <section className="border-t border-border px-4 py-3">
        <p className="text-xs font-medium text-purple-500">{t('pr.merge.merged')}</p>
      </section>
    )
  }
  if (prState !== 'open') {
    return (
      <section className="border-t border-border px-4 py-3">
        <p className="text-xs font-medium text-muted-foreground">{t('pr.merge.closed')}</p>
      </section>
    )
  }

  const canMerge = MERGEABLE_STATES.includes(mergeState) && !isDraft && mergeable !== false && !pending

  return (
    <section data-testid="pr-merge" className="border-t border-border px-4 py-3">
      <div className="flex items-center gap-2">
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value as MergeMethod)}
          data-testid="pr-merge-method"
          className="rounded-md border border-input bg-background px-2 py-1.5 text-xs"
        >
          <option value="merge">{t('pr.merge.methodMerge')}</option>
          <option value="squash">{t('pr.merge.methodSquash')}</option>
          <option value="rebase">{t('pr.merge.methodRebase')}</option>
        </select>

        <Button
          size="sm"
          data-testid="pr-merge-button"
          className="ml-auto h-8 gap-1.5 text-xs"
          disabled={!canMerge}
          onClick={() => merge({ mergeMethod: method })}
        >
          {pending ? <Spinner className="h-3 w-3" /> : <GitMerge className="h-3.5 w-3.5" />}
          {pending ? t('pr.merge.merging') : t('pr.merge.button')}
        </Button>
      </div>

      {/* Two-line explanation of the currently selected merge strategy. */}
      <p className="mt-2 text-[11px] leading-snug text-muted-foreground" data-testid="pr-merge-method-desc">
        {t(methodDescKey[method])}
      </p>
    </section>
  )
}
