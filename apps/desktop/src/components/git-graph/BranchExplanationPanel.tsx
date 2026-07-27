import { useTranslation } from '@git-manager/i18n'
import { useBranchExplanation } from '../../hooks/useBranchExplanation'
import { SummaryProgressNotice } from './components/SummaryProgressNotice'
import { ExplanationPanelShell } from './components/ExplanationPanelShell'

interface BranchExplanationPanelProps {
  repoPath: string
  /** Branch the explanation is about — the range's head, so it needn't be checked out. */
  branch: string
  /** Branch it is compared against (resolved from the repo's merge targets). */
  baseRef: string
  onClose: () => void
}

/**
 * Right-panel reading of everything a branch changes, rendered as markdown.
 *
 * A panel rather than a dialog because of what the content is: a structured, scrollable document the
 * reader wants to keep on screen *while* they look at the graph, the commits and the diffs it talks
 * about. A modal takes the app hostage to show it, and closing it to check something throws the text
 * away.
 *
 * Nothing generates on open — the explanation is remembered per branch and shown immediately.
 * Regenerating is one click, and always the user's decision: only they know whether the branch has
 * moved since.
 */
export function BranchExplanationPanel({
  repoPath,
  branch,
  baseRef,
  onClose,
}: BranchExplanationPanelProps) {
  const { t } = useTranslation('git')
  const {
    explain,
    cancel,
    clear,
    status,
    isGenerating,
    error,
    text,
    generatedAt,
    comparedTo,
    progress,
  } = useBranchExplanation(repoPath, branch)

  // The remembered explanation was diffed against another branch — worth saying, because it silently
  // changes what "what this branch changes" even means.
  const staleComparison = comparedTo !== null && comparedTo !== baseRef && !isGenerating

  return (
    <ExplanationPanelShell
      testId="branch-explanation-panel"
      repoPath={repoPath}
      title={t('gitTree.branchExplanation.panelTitle')}
      subject={
        <span
          className="block truncate font-mono text-xs font-semibold text-foreground"
          data-testid="branch-explanation-branch"
        >
          {branch}
        </span>
      }
      comparison={t('gitTree.branchExplanation.comparedTo', { base: baseRef })}
      emptyHint={t('gitTree.branchExplanation.empty')}
      text={text}
      status={status}
      isGenerating={isGenerating}
      error={error}
      generatedAt={generatedAt}
      staleComparison={staleComparison ? comparedTo : null}
      // Every file is read on its own before a word is written, so on a branch the wait before
      // the first token is the whole map phase. The notice is that wait, not a caveat.
      notice={<SummaryProgressNotice progress={progress} testIdPrefix="branch-explanation" />}
      onGenerate={() => void explain(baseRef)}
      onCancel={() => void cancel()}
      onForget={clear}
      onClose={onClose}
    />
  )
}
