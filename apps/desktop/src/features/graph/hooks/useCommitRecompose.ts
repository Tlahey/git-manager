import { useCallback, useState } from 'react'
import type { GitGraphNode, RebaseTodoStep } from '@git-manager/git-types'
import type { CommitConvention, CommitValidation } from '@git-manager/ai'
import { validateCommitSubject } from '@git-manager/ai'
import { apiGetAiContext, commitRecomposeService } from '../../../api/ai.api'
import {
  apiGetCommitDiff,
  apiListRebaseCommits,
  apiRunInteractiveRebase,
} from '../../../api/git.api'
import { formatUnifiedPatch } from '../../../lib/formatUnifiedPatch'
import { useSettingsStore } from '../../../stores/settings.store'
import { useEffectiveRepoSettings } from '../../../hooks/useEffectiveRepoSettings'

/** One commit on the review screen: what it says now, what the model proposes, and whether the user
 * wants the change. `accepted: false` means "leave this message alone" — the commit is still
 * *rewritten* if it descends from one that changed, but it keeps its text. */
export interface RecomposeProposal {
  oid: string
  shortOid: string
  previousMessage: string
  proposedMessage: string
  accepted: boolean
}

export type RecomposeStatus = 'idle' | 'generating' | 'applying'

/**
 * Rewriting commit messages with the model, reviewed before anything is written.
 *
 * **No new backend command.** Applying goes through the existing `run_interactive_rebase`: its todo
 * renderer already turns a `reword` step into `pick` + `exec git commit --amend -F <file>`, which is
 * multi-line safe, and `apiRunInteractiveRebase` already records the undo entry and brackets the run
 * as activity. Building a second history-rewriting path would have duplicated the riskiest
 * subsystem in the app to gain nothing.
 *
 * **The commits carried along.** Rewording commit *n* forces every commit after it to be rewritten
 * too, because a commit's identity includes its parents. Those commits keep their messages but get
 * new SHAs. The dialog says so; this hook reports the count so it can.
 *
 * Generation is sequential and per commit — each one is a separate completion over its own patch.
 * A failure stops the run and surfaces, rather than applying a half-written plan.
 */
export function useCommitRecompose(
  repoPath: string,
  nodes: GitGraphNode[],
  onApplied?: () => void
) {
  const aiConnection = useSettingsStore((s) => s.settings.ai)
  const { commitInstructions, commitPattern } = useEffectiveRepoSettings(repoPath)

  const [status, setStatus] = useState<RecomposeStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [proposals, setProposals] = useState<RecomposeProposal[]>([])
  /** How far a generating run has got, for the progress line. */
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 })
  const [convention, setConvention] = useState<CommitConvention | null>(null)
  const [recentCommits, setRecentCommits] = useState<string[]>([])

  /**
   * Writes a message for each of `targets` (oldest first), leaving the previous ones in place until
   * each answer lands so the dialog can fill in progressively.
   */
  const generate = useCallback(
    async (targets: { oid: string; shortOid: string; message: string }[]) => {
      setStatus('generating')
      setError(null)
      setProgress({ done: 0, total: targets.length })
      setProposals(
        targets.map((c) => ({
          oid: c.oid,
          shortOid: c.shortOid,
          previousMessage: c.message,
          proposedMessage: '',
          accepted: true,
        }))
      )

      try {
        // The repo's convention is a property of the repo, not of any one commit — fetched once and
        // reused for every target rather than per commit.
        const context = await apiGetAiContext(repoPath, 'staged')
        setConvention(context.commitConvention ?? null)
        setRecentCommits(context.recentCommits ?? [])

        for (const [index, target] of targets.entries()) {
          const diff = await apiGetCommitDiff(repoPath, target.oid)
          const patch = diff.files.map(formatUnifiedPatch).join('\n')

          const message = await commitRecomposeService.run(aiConnection, {
            repoName: context.repoName,
            commit: {
              shortOid: target.shortOid,
              patch,
              filesChanged: diff.files.length,
              insertions: diff.totalAdditions,
              deletions: diff.totalDeletions,
              isMerge:
                (nodes.find((n) => n.commit.oid === target.oid)?.commit.parentOids.length ?? 1) > 1,
            },
            convention: context.commitConvention,
            recentCommits: context.recentCommits,
            commitInstructions,
            commitPattern,
            contextTokens: aiConnection.contextTokens,
          })

          setProposals((prev) =>
            prev.map((p) =>
              p.oid === target.oid
                ? {
                    ...p,
                    proposedMessage: message,
                    // An empty answer is not a message to write. Unaccepted by default so the
                    // commit keeps what it has rather than being rewritten to nothing.
                    accepted: message.trim().length > 0,
                  }
                : p
            )
          )
          setProgress({ done: index + 1, total: targets.length })
        }
      } catch (err) {
        setError(String(err))
      } finally {
        setStatus('idle')
      }
    },
    [repoPath, aiConnection, commitInstructions, commitPattern, nodes]
  )

  function setMessage(oid: string, proposedMessage: string) {
    setProposals((prev) => prev.map((p) => (p.oid === oid ? { ...p, proposedMessage } : p)))
  }

  function toggleAccepted(oid: string) {
    setProposals((prev) => prev.map((p) => (p.oid === oid ? { ...p, accepted: !p.accepted } : p)))
  }

  /** The proposals that will actually change a message: accepted, non-empty, and different. */
  const accepted = proposals.filter(
    (p) =>
      p.accepted &&
      p.proposedMessage.trim() &&
      p.proposedMessage.trim() !== p.previousMessage.trim()
  )

  /** Best-effort convention check per proposal, recomputed so it tracks live edits. */
  const validations: Record<string, CommitValidation> = Object.fromEntries(
    proposals.map((p) => [
      p.oid,
      validateCommitSubject(p.proposedMessage, {
        convention,
        recentCommits,
        userInstructions: commitInstructions,
        pattern: commitPattern,
      }),
    ])
  )

  /**
   * Applies the accepted messages via one interactive rebase.
   *
   * The todo starts at the OLDEST accepted commit and must cover every commit from there to HEAD —
   * `apiListRebaseCommits` returns exactly that set, and anything not being reworded is a plain
   * `pick`. Those picks are what rewrite the descendants: unavoidable, and the reason the dialog
   * warns about SHAs changing.
   */
  const apply = useCallback(async () => {
    if (accepted.length === 0) return
    setStatus('applying')
    setError(null)
    try {
      // Oldest first — `apiListRebaseCommits` returns the range in that order, and the last accepted
      // entry in it is the oldest one the rebase has to start from.
      const byOid = new Map(accepted.map((p) => [p.oid, p]))
      const oldest = [...nodes].reverse().find((n) => byOid.has(n.commit.oid))?.commit.oid

      if (!oldest) {
        setError('RECOMPOSE_TARGET_NOT_IN_GRAPH')
        return
      }

      const range = await apiListRebaseCommits(repoPath, oldest)
      const steps: RebaseTodoStep[] = range.map((commit) => {
        const proposal = byOid.get(commit.oid)
        // Everything not being reworded is a plain `pick` — those picks are what rewrite the
        // descendants' SHAs while leaving their messages alone.
        return proposal
          ? { oid: commit.oid, action: 'reword', message: proposal.proposedMessage.trim() }
          : { oid: commit.oid, action: 'pick' }
      })

      await apiRunInteractiveRebase(repoPath, oldest, steps)
      onApplied?.()
    } catch (err) {
      setError(String(err))
    } finally {
      setStatus('idle')
    }
  }, [accepted, nodes, repoPath, onApplied])

  function reset() {
    setProposals([])
    setError(null)
    setProgress({ done: 0, total: 0 })
    setStatus('idle')
  }

  return {
    status,
    error,
    proposals,
    progress,
    validations,
    setMessage,
    toggleAccepted,
    generate,
    apply,
    reset,
    acceptedCount: accepted.length,
    canApply: accepted.length > 0 && status === 'idle',
  }
}

export type CommitRecompose = ReturnType<typeof useCommitRecompose>
