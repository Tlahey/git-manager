import { useCallback } from 'react'
import type { CommitExplanationCommit } from '@git-manager/ai'
import { commitExplanationService } from '../api/ai.api'
import { apiGetCommitDiff } from '../api/git.api'
import { formatUnifiedPatch } from '../lib/formatUnifiedPatch'
import {
  explanationKey,
  useAiExplanationStore,
  type StoredExplanation,
} from '../stores/aiExplanation.store'
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
  const { run, cancel, reset, status, error, text } = useAiStream(commitExplanationService.cancel)
  const aiConnection = useSettingsStore((s) => s.settings.ai)
  const language = useSettingsStore((s) => s.settings.language)
  const stored: StoredExplanation | undefined = useAiExplanationStore(
    (s) => s.explanations[explanationKey(repoPath, 'commit', commit.oid)]
  )
  const remember = useAiExplanationStore((s) => s.set)
  const forget = useAiExplanationStore((s) => s.clear)

  // What the diff is taken against, for the panel's subtitle and the stored entry.
  const comparedTo = commit.parentCount === 0 ? 'root' : `${commit.shortOid}^`

  const explain = useCallback(
    () =>
      run(
        async () => {
          const diff = await apiGetCommitDiff(repoPath, commit.oid)
          const patch = diff.files.map(formatUnifiedPatch).join('\n')
          // An empty-tree commit or a pure metadata change has nothing to read.
          if (!patch.trim()) return 'AI_NO_COMMIT_CHANGES'

          const payload: CommitExplanationCommit = {
            shortOid: commit.shortOid,
            subject: commit.subject,
            body: commit.body,
            author: commit.author,
            filesChanged: diff.files.length,
            insertions: diff.totalAdditions,
            deletions: diff.totalDeletions,
            isMerge: commit.parentCount > 1,
          }
          await commitExplanationService.run(aiConnection, {
            repoName: repoPath.split('/').filter(Boolean).pop() ?? repoPath,
            commit: payload,
            patch,
            language,
          })
        },
        (full) => remember(repoPath, 'commit', commit.oid, comparedTo, full)
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
      remember,
    ]
  )

  const clear = useCallback(() => {
    forget(repoPath, 'commit', commit.oid)
    reset()
  }, [forget, repoPath, commit.oid, reset])

  const isGenerating = status === 'connecting' || status === 'streaming'

  return {
    explain,
    cancel,
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
