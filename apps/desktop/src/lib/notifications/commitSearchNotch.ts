/**
 * The AI commit search, as a notch card.
 *
 * The first producer of a `progress` card, and the reason the kind exists: a deep search is one
 * model call per *file* of every commit it opens, so a sixty-commit run is minutes. Nobody watches
 * a progress bar for minutes — they switch to their editor, and the run becomes invisible. This is
 * what follows them out of the window.
 *
 * A pure builder, taking the search's own state and returning what the notch should be showing.
 * Keeping it out of the panel is what makes it assertable: every phase, every count, every terminal
 * outcome, without mounting a search.
 */

import type { CommitScanProgress } from '@git-manager/ai'
import type { NotchModel } from '@git-manager/notch'
import type { TFunction } from '@git-manager/i18n'
import type { AiCommitSearchPhase } from '../../hooks/useAiCommitSearch'

/** One card per repository — a second search in the same repo replaces the first. */
export function commitSearchNotchId(repoPath: string): string {
  return `commit-search:${repoPath}`
}

export interface CommitSearchNotchInput {
  repoPath: string
  /** Shown as the card's context line; the repository's own name, not its path. */
  repoName: string
  /** The question being answered — the card's title, because it is what identifies the run. */
  question: string
  phase: AiCommitSearchPhase
  progress: CommitScanProgress | null
  /** How many commits the run found, for the card it leaves behind. */
  matchCount: number
  t: TFunction
}

/**
 * What the notch should show for this search, or `null` for nothing.
 *
 * `null` covers idle *and* cancelled: a user who cancelled does not need to be told what they just
 * did, and a card announcing it would outlive the click that caused it.
 */
export function commitSearchNotchModel(input: CommitSearchNotchInput): NotchModel | null {
  const { phase, progress, question, repoName, matchCount, t } = input
  const id = commitSearchNotchId(input.repoPath)
  const eyebrow = t('gitTree.commitSearch.notch.eyebrow')
  const base = { id, eyebrow, context: repoName } as const

  if (phase === 'idle' || phase === 'cancelled') return null

  if (phase === 'error') {
    return {
      ...base,
      kind: 'status',
      tone: 'error',
      title: t('gitTree.commitSearch.notch.failed'),
      actions: [
        { id: 'activate', label: t('gitTree.commitSearch.notch.open'), variant: 'primary' },
      ],
    }
  }

  if (phase === 'done') {
    return {
      ...base,
      kind: 'status',
      tone: 'success',
      title: t('gitTree.commitSearch.notch.done', { count: matchCount }),
      actions: [
        { id: 'activate', label: t('gitTree.commitSearch.notch.open'), variant: 'primary' },
      ],
    }
  }

  return {
    ...base,
    kind: 'progress',
    tone: 'running',
    title: question,
    ...ratioFor(progress),
    detail: detailFor(progress, t),
    actions: [{ id: 'cancel', label: t('gitTree.commitSearch.notch.cancel') }],
  }
}

/**
 * The bar's fill — and, for every phase but the per-commit read, deliberately absent.
 *
 * The triage and the composition are each a *single* model call. Rendering them as "0 of 1" is a
 * bar sitting at zero for however long the call takes, which reads as stalled; an indeterminate
 * bar reads as working, which is what is actually true.
 */
function ratioFor(progress: CommitScanProgress | null): { ratio?: number } {
  if (!progress || progress.phase !== 'scanning' || progress.total <= 0) return {}
  return { ratio: Math.min(1, progress.completed / progress.total) }
}

/**
 * The line under the bar.
 *
 * Deliberately shorter than the panel's copy for the same phases: this is one truncating line on a
 * card read at a glance from across the room, not a paragraph in a panel the user is sitting in
 * front of.
 *
 * The file count rides along with the commit count for the reason the panel documents — every
 * commit costs one call per file, so "3 of 10" on its own understates the wait by an order of
 * magnitude, and a bar that has barely moved after two minutes looks stuck rather than busy.
 */
function detailFor(progress: CommitScanProgress | null, t: TFunction): string {
  if (!progress) return t('gitTree.commitSearch.notch.composing')

  switch (progress.phase) {
    case 'triaging':
      return t('gitTree.commitSearch.notch.triaging')
    case 'composing':
      return t('gitTree.commitSearch.notch.composing')
    case 'scanning': {
      if (progress.narrowing) return t('gitTree.commitSearch.notch.narrowing')
      const counts = { done: progress.completed, total: progress.total }
      return progress.filesRead
        ? t('gitTree.commitSearch.notch.scanningWithFiles', {
            ...counts,
            files: progress.filesRead,
          })
        : t('gitTree.commitSearch.notch.scanning', counts)
    }
  }
}
