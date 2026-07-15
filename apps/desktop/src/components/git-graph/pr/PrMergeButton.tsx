import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Spinner } from '@git-manager/ui'
import { GitMerge, ChevronDown } from 'lucide-react'
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
const METHODS: MergeMethod[] = ['merge', 'squash', 'rebase']

/** Main button label per method (GitHub-style: the button text reflects the chosen strategy). */
const MAIN_LABEL: Record<MergeMethod, string> = {
  merge: 'pr.merge.button',
  squash: 'pr.merge.methodSquash',
  rebase: 'pr.merge.methodRebase',
}
const METHOD_LABEL: Record<MergeMethod, string> = {
  merge: 'pr.merge.methodMerge',
  squash: 'pr.merge.methodSquash',
  rebase: 'pr.merge.methodRebase',
}
const METHOD_DESC: Record<MergeMethod, string> = {
  merge: 'pr.merge.methodMergeDesc',
  squash: 'pr.merge.methodSquashDesc',
  rebase: 'pr.merge.methodRebaseDesc',
}

/** "Merge pull request" as a split button: the main action merges with the chosen method, and the
 * caret on its right opens a dropdown to pick the strategy (with a 2-line description each) — the
 * same split-button pattern as the commit button. Gated on GitHub's `mergeStateStatus`. */
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
  const [method, setMethod] = useState<MergeMethod>('merge')
  const [menuOpen, setMenuOpen] = useState(false)

  if (merged) {
    return (
      <div className="border-t border-border px-4 py-3">
        <p className="text-xs font-medium text-purple-500">{t('pr.merge.merged')}</p>
      </div>
    )
  }
  if (prState !== 'open') {
    return (
      <div className="border-t border-border px-4 py-3">
        <p className="text-xs font-medium text-muted-foreground">{t('pr.merge.closed')}</p>
      </div>
    )
  }

  const canMerge = MERGEABLE_STATES.includes(mergeState) && !isDraft && mergeable !== false && !pending

  return (
    <section data-testid="pr-merge" className="border-t border-border px-4 py-3">
      <div className="relative inline-flex">
        <Button
          size="sm"
          data-testid="pr-merge-button"
          className="h-8 gap-1.5 rounded-r-none text-xs"
          disabled={!canMerge}
          onClick={() => merge({ mergeMethod: method })}
        >
          {pending ? <Spinner className="h-3 w-3" /> : <GitMerge className="h-3.5 w-3.5" />}
          {pending ? t('pr.merge.merging') : t(MAIN_LABEL[method])}
        </Button>
        <Button
          size="sm"
          data-testid="pr-merge-method"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title={t('pr.merge.chooseMethod')}
          className="h-8 w-7 rounded-l-none border-l border-primary-foreground/25 px-0"
          disabled={pending}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>

        {menuOpen && (
          <>
            <button
              aria-hidden
              tabIndex={-1}
              className="fixed inset-0 z-40 cursor-default"
              onClick={() => setMenuOpen(false)}
            />
            <div
              role="menu"
              data-testid="pr-merge-method-menu"
              className="animate-in fade-in absolute bottom-full right-0 z-50 mb-1.5 w-72 overflow-hidden rounded-lg border border-border bg-popover p-1 shadow-xl duration-100"
            >
              {METHODS.map((m) => (
                <button
                  key={m}
                  role="menuitem"
                  data-testid={`pr-merge-method-${m}`}
                  onClick={() => {
                    setMethod(m)
                    setMenuOpen(false)
                  }}
                  className={`flex w-full flex-col items-start gap-0.5 rounded px-2 py-1.5 text-left transition-colors hover:bg-accent ${
                    m === method ? 'bg-accent/50' : ''
                  }`}
                >
                  <span className="text-xs font-medium text-foreground">{t(METHOD_LABEL[m])}</span>
                  <span className="text-[11px] leading-snug text-muted-foreground">
                    {t(METHOD_DESC[m])}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  )
}
