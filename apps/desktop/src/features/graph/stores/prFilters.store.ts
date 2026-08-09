import { createSavedFiltersStore, savedFilterLabel, type SavedFilter } from './savedFilters'

/** A saved view of the repository's pull requests. See {@link SavedFilter} for what `query` accepts. */
export type PrFilter = SavedFilter

/**
 * The filters a fresh install starts with — the four fixed groups this section used to hardcode,
 * now ordinary editable entries. They reuse those groups' own label keys, so the copy is unchanged
 * for anyone who never opens the filter editor.
 *
 * They overlap by design (a PR you opened *and* were assigned shows under both), which is why the
 * section's count is the de-duplicated union rather than the sum.
 */
export const DEFAULT_PR_FILTERS: PrFilter[] = [
  {
    id: 'builtin:mine',
    name: '',
    labelKey: 'sidebar.prGroups.mine',
    query: 'is:open author:@me',
  },
  {
    id: 'builtin:assigned',
    name: '',
    labelKey: 'sidebar.prGroups.assigned',
    query: 'is:open assignee:@me',
  },
  {
    id: 'builtin:awaiting-review',
    name: '',
    labelKey: 'sidebar.prGroups.awaitingReview',
    query: 'is:open review-requested:@me',
  },
  { id: 'builtin:all', name: '', labelKey: 'sidebar.prGroups.all', query: 'is:open' },
]

/** Label to display for a filter — the user's own name, or the built-in's translated one. */
export const prFilterLabel = savedFilterLabel

export const usePrFiltersStore = createSavedFiltersStore(
  'git-manager-pr-filters',
  DEFAULT_PR_FILTERS
)
