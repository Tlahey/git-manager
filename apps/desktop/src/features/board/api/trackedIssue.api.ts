import type { Board, BoardCard, BoardCardSourceIssue } from '@git-manager/git-types'
import {
  type GhRawIssue,
  fetchIssueDetail,
  updateIssue,
} from '../../../api/github/github-issues.api'
import {
  addAssignees,
  addLabels,
  createOrUpdateLabel,
  removeAssignees,
  removeLabel,
} from '../../../api/github/github-labels.api'
import {
  bodyForTrackedCard,
  mergeTrackedIssue,
  reconcileTrackedLabels,
  trackedLabelsFor,
  type RawTrackedIssue,
} from './trackedIssueMapping'

/**
 * The network side of tracking a GitHub issue from a **local** board.
 *
 * The Rust backend stores only the link (`BoardCard.sourceIssue`) — it makes no network calls at all
 * — so fetching the issue and merging it over the stored card happens here, on every board read. The
 * pure half of that (which field comes from where, which labels may be touched) is in
 * `trackedIssueMapping.ts`.
 *
 * One request per tracked card, issued in parallel. The repo's own issues endpoint would be a single
 * call but only returns *open* issues, and a tracked issue that someone closed is exactly the case
 * this feature exists to surface — so correctness wins over the request count here.
 */

function rawToTracked(raw: GhRawIssue): RawTrackedIssue {
  return {
    number: raw.number,
    title: raw.title,
    body: raw.body ?? '',
    updatedAt: raw.updated_at,
    labels: (raw.labels ?? []).map((l) => l.name),
    assignees: (raw.assignees ?? []).map((a) => a.login),
    commentCount: raw.comments,
    // GitHub types this as a plain string; anything that isn't `closed` is treated as open rather
    // than as a third state the UI would have to invent a rendering for.
    state: raw.state === 'closed' ? 'closed' : 'open',
  }
}

/**
 * Merges every tracked card on the board with its issue.
 *
 * A card whose issue can't be fetched — offline, revoked token, issue deleted or transferred — is
 * returned **unchanged** rather than dropped or blanked: the stored card is the offline cache, so
 * the board degrades to stale content instead of to holes. `issueState` staying `undefined` is what
 * tells the UI it is looking at a card whose issue it could not reach.
 */
export async function mergeTrackedIssues(
  board: Board,
  cards: BoardCard[],
  token: string
): Promise<BoardCard[]> {
  const tracked = cards.filter((c) => c.sourceIssue)
  if (tracked.length === 0) return cards

  const fetched = await Promise.all(
    tracked.map(async (card) => {
      const ref = card.sourceIssue as BoardCardSourceIssue
      try {
        const raw = await fetchIssueDetail(ref.owner, ref.repo, ref.number, token)
        return [card.id, rawToTracked(raw)] as const
      } catch {
        return [card.id, null] as const
      }
    })
  )
  const byCardId = new Map(fetched)

  return cards.map((card) => {
    const issue = byCardId.get(card.id)
    return issue ? mergeTrackedIssue(board, card, issue) : card
  })
}

/** Fetches one issue for the "add to board" flow, so the new card starts with real content. */
export async function fetchIssueForTracking(
  ref: BoardCardSourceIssue,
  token: string
): Promise<RawTrackedIssue> {
  return rawToTracked(await fetchIssueDetail(ref.owner, ref.repo, ref.number, token))
}

/**
 * Writes a tracked card back to its issue.
 *
 * `next` is the card as it should now be — already merged and patched — so the body is composed from
 * the whole card and a patch touching one field never blanks the rest. The issue's current labels and
 * assignees are re-read here rather than taken from `next`, because they are what the reconcile has
 * to diff against and the card carries no record of the labels it isn't responsible for.
 */
export async function pushCardToIssue(
  board: Board,
  next: BoardCard,
  ref: BoardCardSourceIssue,
  token: string
): Promise<void> {
  const { owner, repo, number } = ref
  const raw = await fetchIssueDetail(owner, repo, number, token)

  await updateIssue(
    owner,
    repo,
    number,
    { title: next.title, body: bodyForTrackedCard(next, raw.body ?? '') },
    token
  )

  const currentAssignees = (raw.assignees ?? []).map((a) => a.login)
  const stale = currentAssignees.filter((login) => login !== next.assignee)
  if (stale.length > 0) await removeAssignees(owner, repo, number, stale, token)
  if (next.assignee && !currentAssignees.includes(next.assignee)) {
    await addAssignees(owner, repo, number, [next.assignee], token)
  }

  const currentLabels = (raw.labels ?? []).map((l) => l.name)
  const desired = trackedLabelsFor(board, next)
  const { toAdd, toRemove } = reconcileTrackedLabels(board, currentLabels, desired)

  for (const label of toRemove) {
    await removeLabel(owner, repo, number, label, token)
  }
  if (toAdd.length > 0) {
    // A board tag has a colour the repo's label may not have yet. Created before it is attached, so
    // the label never appears in GitHub's default grey and then changes colour on a later edit.
    for (const tag of board.tags.filter((t) => toAdd.includes(t.name))) {
      await createOrUpdateLabel(owner, repo, tag.name, tag.color, token)
    }
    await addLabels(owner, repo, number, toAdd, token)
  }
}
