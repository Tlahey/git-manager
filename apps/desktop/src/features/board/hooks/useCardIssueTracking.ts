import { useMemo } from 'react'
import { toast } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import type { Board, BoardCard, BoardCardSourceIssue, BoardComment } from '@git-manager/git-types'
import type { OwnerRepo } from '../../../hooks/useRepoGitHub'
import { localBoardBackend } from '../api/local-board.api'
import { fetchRemoteCardComments, addExistingIssueToColumn } from '../api/remote-board.api'
import { fetchIssueForTracking } from '../api/trackedIssue.api'
import { parseCardBody } from '../api/cardBodyMarkdown'

interface CardIssueTrackingDeps {
  repoPath: string
  activeBoard: Board | null
  cards: BoardCard[]
  ownerRepo: OwnerRepo | null
  token: string | null
  mutateDetail: () => void
}

/**
 * Everything about the seam between a card and a GitHub issue: which issues this board already
 * follows, whether a given card follows one, pulling an issue onto the board, and where a card's
 * discussion actually lives.
 *
 * Kept apart from the card mutations because the rule it enforces is its own — *one issue, at most
 * one card* — and because the answer to "where do this card's comments come from" is the same
 * three-way branch (plain local / tracked / remote) that everything else here turns on.
 */
export function useCardIssueTracking({
  repoPath,
  activeBoard,
  cards,
  ownerRepo,
  token,
  mutateDetail,
}: CardIssueTrackingDeps) {
  const { t } = useTranslation('board')

  /**
   * The issues this board already tracks — what "add an issue" refuses to duplicate, and what the
   * picker greys out. Archived cards count: the issue is still spoken for, and adding a second card
   * for it would resurrect it under a different id.
   */
  const trackedIssueNumbers = useMemo(
    () => cards.map((c) => c.sourceIssue?.number).filter((n): n is number => n !== undefined),
    [cards]
  )

  /** The issue a card tracks, or `null` — tracking needs a local board and a usable token. */
  function trackedRef(card: BoardCard): BoardCardSourceIssue | null {
    if (!activeBoard || activeBoard.source !== 'local') return null
    if (!card.sourceIssue || !token) return null
    return card.sourceIssue
  }

  /**
   * A card's discussion. A plain local card carries its own; a remote card's — and a tracked card's —
   * live on GitHub and are fetched per card on open, so a fifty-card board doesn't pay fifty extra
   * requests on every load for a thread only the opened dialog shows.
   */
  async function loadComments(card: BoardCard): Promise<BoardComment[]> {
    const ref = trackedRef(card)
    if (ref) return fetchRemoteCardComments(ref.owner, ref.repo, token!, String(ref.number))
    if (!activeBoard || activeBoard.source === 'local') return card.comments
    if (!ownerRepo || !token) return []
    return fetchRemoteCardComments(ownerRepo.owner, ownerRepo.repo, token, card.id)
  }

  /**
   * "Add to board" (issue → card) for the *active* board.
   *
   * A remote board just labels the existing issue — no new issue is created, see
   * `addExistingIssueToColumn`. A local board creates a **tracked** card: it stores the link and a
   * copy of the issue's content as its offline cache, and from then on the issue is the source of
   * truth for everything but the card's placement.
   *
   * One issue, at most one card. Two cards tracking the same issue would each claim to own its
   * content and overwrite the other on every edit, so this refuses rather than producing a pair that
   * fight. The refusal lives here rather than only in the picker because the picker isn't the only
   * way in — a pasted reference reaches this directly.
   */
  async function addIssueToBoard(issueNumber: number, columnId: string): Promise<void> {
    if (!activeBoard) return
    if (!ownerRepo || !token) throw new Error('This repository has no connected GitHub account')
    if (activeBoard.source === 'local') {
      if (trackedIssueNumbers.includes(issueNumber)) {
        toast.error(t('addIssue.alreadyOnBoard', { number: issueNumber }))
        return
      }
      const ref = { owner: ownerRepo.owner, repo: ownerRepo.repo, number: issueNumber }
      const issue = await fetchIssueForTracking(ref, token)
      // The parsed description, not the raw body: the cache should hold what the merge would show,
      // so a card looks the same before and after its first refresh.
      const { description } = parseCardBody(issue.body)
      await localBoardBackend.createCard(repoPath, activeBoard.id, columnId, {
        title: issue.title,
        description,
        // The board's own sequence, like any other card it holds. A tracked card carries *two*
        // numbers on purpose — `GM-8` is where the work sits on this board, `#42` is what the issue
        // is called on GitHub — and they are not interchangeable. Leaving the prefix out is what
        // made every card added from an issue arrive numberless.
        prefix: activeBoard.cardPrefixes[0] ?? '',
        sourceIssue: ref,
      })
    } else {
      await addExistingIssueToColumn(
        ownerRepo.owner,
        ownerRepo.repo,
        token,
        activeBoard.id,
        issueNumber,
        columnId
      )
    }
    mutateDetail()
  }

  return { trackedIssueNumbers, trackedRef, loadComments, addIssueToBoard }
}
