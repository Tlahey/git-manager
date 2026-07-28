import { useCallback, useRef, useState } from 'react'
import { fileSummaryFeature, summarizeFiles, type SummaryProgress } from '@git-manager/ai'
import { fileSummaryService, summaryExplanationService } from '../api/ai.api'
import { apiGetCommitDiff } from '../api/git.api'
import { formatUnifiedPatch } from '../lib/formatUnifiedPatch'
import {
  explanationKey,
  useAiExplanationStore,
  type StoredExplanation,
} from '../stores/aiExplanation.store'
import { trackAiProgress } from '../stores/aiActivity.store'
import { useSettingsStore } from '../stores/settings.store'
import { useAiStream, type AiStreamStatus } from './useAiStream'

export type CommitExplanationStatus = AiStreamStatus

/** The commit metadata the panel already holds from the graph node; the diff and the stats are
 * fetched here. */
export interface CommitExplanationSubject {
  oid: string
  shortOid: string
  subject: string
  body: string
  author: string
  /** Number of parents — >1 means the diff is against the first parent only. */
  parentCount: number
}

/**
 * Drives the commit side of the explanation panel.
 *
 * Unlike the branch explanation, this needs no `get_ai_context` call: `get_commit_diff` already
 * returns the commit against its first parent (and against the empty tree for a root commit), and
 * `formatUnifiedPatch` turns those structured hunks back into the patch text a model expects. So a
 * commit explanation costs one existing command and no backend change.
 *
 * A successful run is remembered per commit. Commits are immutable, so unlike a branch summary that
 * answer stays correct indefinitely — the age is shown anyway, since the *explanation* can still be
 * a poor one worth redoing.
 */
export function useCommitExplanation(repoPath: string, commit: CommitExplanationSubject) {
  const { run, cancel, reset, status, error, text } = useAiStream(summaryExplanationService.cancel)
  const aiConnection = useSettingsStore((s) => s.settings.ai)
  const language = useSettingsStore((s) => s.settings.language)
  // The model's declared context window sizes how much of the commit's patch is sent.
  const contextTokens = aiConnection.contextTokens
  const stored: StoredExplanation | undefined = useAiExplanationStore(
    (s) => s.explanations[explanationKey(repoPath, 'commit', commit.oid)]
  )
  const remember = useAiExplanationStore((s) => s.set)
  const forget = useAiExplanationStore((s) => s.clear)

  // What the diff is taken against, for the panel's subtitle and the stored entry.
  const comparedTo = commit.parentCount === 0 ? 'root' : `${commit.shortOid}^`

  /** Progress of the map phase: one call per file the commit touches, before the stream starts. */
  const [progress, setProgress] = useState<SummaryProgress | null>(null)
  /** Set by `cancel`, polled by the map loop between calls — a ref, since the loop closed over the
   * render that started it. */
  const cancelledRef = useRef(false)

  const explain = useCallback(
    () =>
      run(
        async (requestId) => {
          const diff = await apiGetCommitDiff(repoPath, commit.oid)
          const patch = diff.files.map(formatUnifiedPatch).join('\n')
          // An empty-tree commit or a pure metadata change has nothing to read.
          if (!patch.trim()) return 'AI_NO_COMMIT_CHANGES'

          // Read each touched file on its own before explaining the commit. The single budgeted
          // patch this replaced meant a large commit was explained from whichever files fitted.
          cancelledRef.current = false
          const files = diff.files.map((f) => ({
            path: f.newPath || f.oldPath,
            status: f.status,
          }))
          const summaries = await summarizeFiles(
            {
              diff: patch,
              files,
              repoName: repoPath.split('/').filter(Boolean).pop() ?? repoPath,
              branch: '',
            },
            (summaryInput) => fileSummaryService.run(aiConnection, summaryInput),
            contextTokens,
            {
              onProgress: trackAiProgress(fileSummaryFeature.id, setProgress),
              shouldCancel: () => cancelledRef.current,
              concurrency: aiConnection.concurrency,
            }
          )
          setProgress(null)

          await summaryExplanationService.run(
            aiConnection,
            {
              scope: 'commit',
              repoName: repoPath.split('/').filter(Boolean).pop() ?? repoPath,
              commit: {
                shortOid: commit.shortOid,
                subject: commit.subject,
                body: commit.body,
                author: commit.author,
              },
              summaries,
              language,
              contextTokens,
            },
            requestId
          )
        },
        {
          onComplete: (full) =>
            remember(
              repoPath,
              'commit',
              commit.oid,
              comparedTo,
              full
            ),
        }
      ),
    [
      run,
      repoPath,
      commit.oid,
      commit.shortOid,
      commit.subject,
      commit.body,
      commit.author,
      commit.parentCount,
      comparedTo,
      aiConnection,
      language,
      contextTokens,
      remember,
    ]
  )

  const clear = useCallback(() => {
    forget(repoPath, 'commit', commit.oid)
    setProgress(null)
    reset()
  }, [forget, repoPath, commit.oid, reset])

  /** Stops the map phase at its next call boundary, then the stream. */
  const cancelRun = useCallback(async () => {
    cancelledRef.current = true
    setProgress(null)
    await cancel()
  }, [cancel])

  const isGenerating = status === 'connecting' || status === 'streaming'

  return {
    explain,
    cancel: cancelRun,
    progress,
    clear,
    status,
    isGenerating,
    error,
    text: isGenerating || status === 'done' ? text : (stored?.text ?? text),
    generatedAt: stored?.generatedAt ?? null,
    comparedTo: stored?.comparedTo ?? null,
    hasStored: stored !== undefined,
  }
}
