import type { MockPR } from './types'

/**
 * The buckets the "My Pull Requests" list is split into, in display order. Each PR lands in
 * exactly one bucket via {@link classifyPr} (first predicate wins), so the groups partition the
 * list. `other` is the catch-all for PRs that match none of the actionable states.
 */
export type PrGroupKey =
  | 'readyToMerge'
  | 'unassignedReviewers'
  | 'resolveConflicts'
  | 'needsMyReview'
  | 'draft'
  | 'other'

/** Display (and first-match assignment) order for the groups. */
export const PR_GROUP_ORDER: PrGroupKey[] = [
  'readyToMerge',
  'unassignedReviewers',
  'resolveConflicts',
  'needsMyReview',
  'draft',
  'other',
]

/** Per-group presentation: i18n label key (launchpad namespace) and header accent colour. */
export const PR_GROUP_META: Record<PrGroupKey, { labelKey: string; accent?: string }> = {
  readyToMerge: { labelKey: 'group.readyToMerge', accent: 'text-emerald-400' },
  unassignedReviewers: { labelKey: 'group.unassignedReviewers', accent: 'text-sky-400' },
  resolveConflicts: { labelKey: 'group.resolveConflicts', accent: 'text-red-400' },
  needsMyReview: { labelKey: 'group.needsReview', accent: 'text-orange-400' },
  draft: { labelKey: 'group.draft' },
  other: { labelKey: 'group.other' },
}

/**
 * Assign a PR to a single group. Predicates are evaluated in {@link PR_GROUP_ORDER} and the first
 * match wins; each is self-guarded so the buckets stay sensible regardless of order (e.g. a
 * conflicted PR never counts as "ready to merge" or "unassigned", it surfaces under "resolve
 * conflicts"). `collaborators` mirrors the PR's requested reviewers, so an empty list means no
 * reviewer has been asked yet.
 */
export function classifyPr(pr: MockPR): PrGroupKey {
  const isClosed = pr.status === 'merged' || pr.status === 'closed'
  if (!pr.isDraft && !pr.needsRebase && pr.status === 'approved') return 'readyToMerge'
  if (
    !pr.isDraft &&
    !pr.needsRebase &&
    !isClosed &&
    !pr.needsMyReview &&
    pr.collaborators.length === 0
  ) {
    return 'unassignedReviewers'
  }
  if (pr.needsRebase && !pr.isDraft) return 'resolveConflicts'
  if (pr.needsMyReview) return 'needsMyReview'
  if (pr.isDraft) return 'draft'
  return 'other'
}

/** Partition PRs into the groups, preserving the input order within each bucket. */
export function groupPrs(prs: MockPR[]): Record<PrGroupKey, MockPR[]> {
  const groups: Record<PrGroupKey, MockPR[]> = {
    readyToMerge: [],
    unassignedReviewers: [],
    resolveConflicts: [],
    needsMyReview: [],
    draft: [],
    other: [],
  }
  for (const pr of prs) {
    groups[classifyPr(pr)].push(pr)
  }
  return groups
}
