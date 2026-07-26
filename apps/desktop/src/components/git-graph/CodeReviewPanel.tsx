import { useTranslation } from '@git-manager/i18n'
import { useCodeReview, type CodeReviewTarget } from '../../hooks/useCodeReview'
import { ExplanationPanelShell } from './components/ExplanationPanelShell'

interface CodeReviewPanelProps {
  repoPath: string
  /** What to review: the uncommitted tree, or a branch against `baseRef`. */
  target: CodeReviewTarget
  /** The branch the review is read against — required by, and only used for, the branch target. */
  baseRef?: string
  onClose: () => void
}

/**
 * Right-panel AI review of a change — the "is this alright?" counterpart to the explanation panels,
 * which are explicitly instructed not to have an opinion.
 *
 * Reuses {@link ExplanationPanelShell} outright: everything the user touches here (generate, stop,
 * copy, forget, the age line, the stale-base warning) is identical, and the shell is already the
 * shared chrome of three panels. What differs is entirely in the hook and the prompt.
 *
 * Both targets render through this one component. The branch review is remembered and so carries an
 * age and a comparison; the working one is regenerated every time, which the shell renders as "no age
 * line, generate on open" — the same shape the working explanation already relies on.
 */
export function CodeReviewPanel({ repoPath, target, baseRef, onClose }: CodeReviewPanelProps) {
  const { t } = useTranslation('git')
  const {
    review,
    cancel,
    clear,
    status,
    isGenerating,
    error,
    text,
    generatedAt,
    comparedTo,
    promptSize,
    coverage,
  } = useCodeReview(repoPath, target)

  const isBranch = target.scope === 'branch'

  // The remembered review read the branch against a different base — worth saying, because it
  // changes which commits were even looked at.
  const staleComparison =
    isBranch && comparedTo !== null && comparedTo !== baseRef && !isGenerating ? comparedTo : null

  /**
   * What the run read, and what it would take to read it all — informational, not a warning.
   *
   * It replaced an overflow warning, and the reason is that the warning stopped being true. While
   * the diff budget was a constant, an oversized change produced an oversized prompt and the panel
   * had to say so. Now the budget follows the model's window, so the prompt never overflows: it
   * reads fewer files. That is not a failure to alarm someone about, it is a fact with an action
   * attached — raise the window, read the rest — so it is phrased and coloured as such.
   *
   * Silent when everything was read, which is the common case on a normal change.
   */
  const coverageNotice =
    coverage && !coverage.complete ? (
      <p data-testid="code-review-coverage" className="text-[10px] text-muted-foreground">
        {t('gitTree.codeReview.coverage', {
          read: coverage.filesRead,
          total: coverage.filesTotal,
          window: Math.round(coverage.requiredContextTokens / 1024),
        })}
      </p>
    ) : null

  /**
   * The one genuinely broken state left: a declared window too small to hold even the instruction.
   * No amount of trimming the diff fixes it, so it stays a warning rather than information.
   */
  const unusableWindowNotice =
    promptSize?.risk === 'over' ? (
      <p data-testid="code-review-prompt-size" className="text-[10px] text-tone-danger">
        {t('gitTree.codeReview.windowTooSmall', { context: promptSize.contextTokens })}
      </p>
    ) : null

  return (
    <ExplanationPanelShell
      testId="code-review-panel"
      repoPath={repoPath}
      title={t('gitTree.codeReview.panelTitle')}
      subject={
        isBranch ? (
          <span
            className="block truncate font-mono text-xs font-semibold text-foreground"
            data-testid="code-review-subject"
          >
            {target.branch}
          </span>
        ) : (
          <span
            className="block truncate text-xs font-semibold text-foreground"
            data-testid="code-review-subject"
          >
            {t('gitTree.codeReview.workingSubject')}
          </span>
        )
      }
      comparison={
        isBranch
          ? t('gitTree.codeReview.comparedToBase', { base: baseRef ?? '' })
          : t('gitTree.codeReview.comparedToHead')
      }
      emptyHint={t('gitTree.codeReview.empty')}
      text={text}
      status={status}
      isGenerating={isGenerating}
      error={error}
      generatedAt={generatedAt}
      staleComparison={staleComparison}
      notice={
        unusableWindowNotice || coverageNotice ? (
          <>
            {unusableWindowNotice}
            {coverageNotice}
          </>
        ) : null
      }
      onGenerate={() => void review(baseRef)}
      onCancel={() => void cancel()}
      onForget={clear}
      onClose={onClose}
    />
  )
}
