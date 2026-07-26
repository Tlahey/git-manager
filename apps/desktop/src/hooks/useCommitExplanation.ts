import { useCallback, useRef, useState } from 'react'
import {
  assessCommitExplanationCoverage,
  type CommitExplanationCommit,
  type DiffCoverage,
} from '@git-manager/ai'
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
  // The model's declared context window sizes how much of the commit's patch is sent.
  const contextTokens = aiConnection.contextTokens
  const stored: StoredExplanation | undefined = useAiExplanationStore(
    (s) => s.explanations[explanationKey(repoPath, 'commit', commit.oid)]
  )
  const remember = useAiExplanationStore((s) => s.set)
  const forget = useAiExplanationStore((s) => s.clear)

  // What the diff is taken against, for the panel's subtitle and the stored entry.
  const comparedTo = commit.parentCount === 0 ? 'root' : `${commit.shortOid}^`

  /**
   * How much of the commit the last run actually read, and the window it would take to read all of
   * it. Same machinery as the code review, and needed here for the same reason: the patch is
   * budgeted against the model's window, so on a large commit the answer describes a part of it —
   * and an explanation reads as confident whatever it saw.
   *
   * Stored with the answer, and the mirror ref exists because of *when* it is stored: the completion
   * callback below is created during the same render as this state, so it would close over the
   * previous value and remember the coverage of the run before this one.
   */
  const [coverage, setCoverage] = useState<DiffCoverage | null>(null)
  const lastCoverage = useRef<DiffCoverage | null>(null)

  const explain = useCallback(
    () =>
      run(
        async (requestId) => {
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
          const input = {
            repoName: repoPath.split('/').filter(Boolean).pop() ?? repoPath,
            commit: payload,
            patch,
            // The complete inventory, sent whether or not each file's diff survives the budget. The
            // path must be the one `formatUnifiedPatch` writes into the `diff --git` header, or the
            // prompt cannot mark the entries whose diff was dropped.
            files: diff.files.map((f) => ({
              path: f.newPath || f.oldPath,
              status: f.status,
              insertions: f.additions,
              deletions: f.deletions,
            })),
            language,
            contextTokens,
          }
          const assessed = assessCommitExplanationCoverage(input)
          lastCoverage.current = assessed
          setCoverage(assessed)
          await commitExplanationService.run(aiConnection, input, requestId)
        },
        {
          onComplete: (full) =>
            remember(
              repoPath,
              'commit',
              commit.oid,
              comparedTo,
              full,
              lastCoverage.current ?? undefined
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
    lastCoverage.current = null
    setCoverage(null)
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
    /**
     * What the shown answer read, and the window needed to read it all.
     *
     * Falls back to the remembered coverage so a stored explanation keeps its caveat: without this
     * the text and its age survived a reload while "read 6 of 26 files" did not, which made an old
     * answer look *more* authoritative than a fresh one. `null` only before any run, or for an entry
     * written before coverage was stored.
     */
    coverage: coverage ?? stored?.coverage ?? null,
  }
}
