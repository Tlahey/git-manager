import { useTranslation } from '@git-manager/i18n'
import {
  useCommitExplanation,
  type CommitExplanationSubject,
} from '../../hooks/useCommitExplanation'
import { SummaryProgressNotice } from './components/SummaryProgressNotice'
import { ExplanationPanelShell } from './components/ExplanationPanelShell'

interface CommitExplanationPanelProps {
  repoPath: string
  commit: CommitExplanationSubject
  onClose: () => void
}

/**
 * Right-panel reading of what a single commit does, rendered as markdown.
 *
 * The counterpart to the branch summary, and the reason both exist: right-clicking a commit used to
 * offer only "explain this branch", which on a commit carrying no branch label meant explaining
 * whatever branch happened to be checked out — not what was clicked. This answers the question that
 * was actually being asked.
 *
 * Its value is highest where a commit message is worst: a terse subject, a squashed merge, an old
 * commit whose "fix stuff" tells you nothing. The prompt is explicitly told not to paraphrase the
 * message back.
 */
export function CommitExplanationPanel({ repoPath, commit, onClose }: CommitExplanationPanelProps) {
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
  } = useCommitExplanation(repoPath, commit)

  const currentComparison = commit.parentCount === 0 ? 'root' : `${commit.shortOid}^`
  // A commit is immutable, so a remembered explanation can only mismatch if the app's own
  // comparison changed (e.g. a future first-parent-vs-all-parents option). Reported all the same.
  const staleComparison = comparedTo !== null && comparedTo !== currentComparison && !isGenerating

  return (
    <ExplanationPanelShell
      testId="commit-explanation-panel"
      repoPath={repoPath}
      title={t('gitTree.commitExplanation.panelTitle')}
      subject={
        <div className="flex min-w-0 flex-col gap-0.5">
          <span
            className="truncate font-mono text-xs font-semibold text-primary"
            data-testid="commit-explanation-sha"
          >
            {commit.shortOid}
          </span>
          <span className="truncate text-xs text-foreground" title={commit.subject}>
            {commit.subject}
          </span>
        </div>
      }
      comparison={
        commit.parentCount === 0
          ? t('gitTree.commitExplanation.comparedToRoot')
          : commit.parentCount > 1
            ? t('gitTree.commitExplanation.comparedToFirstParent')
            : t('gitTree.commitExplanation.comparedToParent')
      }
      emptyHint={t('gitTree.commitExplanation.empty')}
      text={text}
      status={status}
      isGenerating={isGenerating}
      error={error}
      generatedAt={generatedAt}
      staleComparison={staleComparison ? comparedTo : null}
      // The map phase runs before the stream starts; without this the panel looks hung.
      notice={<SummaryProgressNotice progress={progress} testIdPrefix="commit-explanation" />}
      onGenerate={() => void explain()}
      onCancel={() => void cancel()}
      onForget={clear}
      onClose={onClose}
    />
  )
}
