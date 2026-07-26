import { useTranslation } from '@git-manager/i18n'
import { useWorkingExplanation } from '../../hooks/useWorkingExplanation'
import { ExplanationPanelShell } from './components/ExplanationPanelShell'

interface WorkingExplanationPanelProps {
  repoPath: string
  onClose: () => void
}

/**
 * Right-panel summary of everything currently uncommitted — "what am I in the middle of?".
 *
 * Opened from the WIP row's context menu, where the item had been sitting disabled since before the
 * AI features existed. The third and last of the explanation panels, sharing
 * {@link ExplanationPanelShell} with the branch and commit ones.
 *
 * Unlike those two it keeps no memory: the working tree moves under the summary constantly, so every
 * open generates fresh (see {@link useWorkingExplanation}).
 */
export function WorkingExplanationPanel({ repoPath, onClose }: WorkingExplanationPanelProps) {
  const { t } = useTranslation('git')
  const { explain, cancel, clear, status, isGenerating, error, text } =
    useWorkingExplanation(repoPath)

  return (
    <ExplanationPanelShell
      testId="working-explanation-panel"
      repoPath={repoPath}
      title={t('gitTree.workingExplanation.panelTitle')}
      subject={
        <span
          className="block truncate text-xs font-semibold text-foreground"
          data-testid="working-explanation-subject"
        >
          {t('gitTree.workingExplanation.subject')}
        </span>
      }
      comparison={t('gitTree.workingExplanation.comparedTo')}
      emptyHint={t('gitTree.workingExplanation.empty')}
      text={text}
      status={status}
      isGenerating={isGenerating}
      error={error}
      generatedAt={null}
      staleComparison={null}
      onGenerate={() => void explain()}
      onCancel={() => void cancel()}
      onForget={clear}
      onClose={onClose}
    />
  )
}
