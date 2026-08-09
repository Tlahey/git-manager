import { createSavedFiltersStore, savedFilterLabel, type SavedFilter } from './savedFilters'

/** A saved view of the repository's issues. See {@link SavedFilter} for what `query` accepts. */
export type IssueFilter = SavedFilter

/**
 * The two filters a fresh install starts with. They are ordinary entries, not special cases: the
 * user can rename, re-query, reorder or delete them like any other.
 */
export const DEFAULT_ISSUE_FILTERS: IssueFilter[] = [
  {
    id: 'builtin:all-open',
    name: '',
    labelKey: 'sidebar.issueFilters.defaults.allOpen',
    query: 'is:open',
  },
  {
    id: 'builtin:mine-open',
    name: '',
    labelKey: 'sidebar.issueFilters.defaults.myOpen',
    query: 'is:open author:@me',
  },
]

/** Label to display for a filter — the user's own name, or the built-in's translated one. */
export const issueFilterLabel = savedFilterLabel

export const useIssueFiltersStore = createSavedFiltersStore(
  'git-manager-issue-filters',
  DEFAULT_ISSUE_FILTERS
)
