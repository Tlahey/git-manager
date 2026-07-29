import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * One saved view of a repository's issues, shown as a sub-group inside the sidebar's Issues section.
 *
 * `query` is raw **GitHub issue-search syntax** (`is:open assignee:@me`, `label:bug -label:wontfix`,
 * …) and is sent to GitHub verbatim rather than evaluated locally — the point of the feature is that
 * anything expressible in GitHub's own search box works here, including qualifiers this app has
 * never heard of. The `repo:` and `is:issue` qualifiers are added by the fetch layer, so a filter
 * never has to restate which repository it applies to.
 */
export interface IssueFilter {
  id: string
  /** User-chosen label. Empty for a built-in filter, whose label comes from {@link IssueFilter.labelKey}. */
  name: string
  /**
   * i18n key (in the `git` namespace) naming a built-in filter. Set only on the two filters shipped
   * by default, and dropped as soon as the user renames one — a name the user typed is their own
   * text, not a translatable string.
   */
  labelKey?: string
  query: string
}

/**
 * The two filters a fresh install starts with. They are ordinary entries, not special cases: the
 * user can rename, re-query, reorder or delete them like any other.
 */
export const DEFAULT_ISSUE_FILTERS: IssueFilter[] = [
  { id: 'builtin:all-open', name: '', labelKey: 'sidebar.issueFilters.defaults.allOpen', query: 'is:open' },
  {
    id: 'builtin:mine-open',
    name: '',
    labelKey: 'sidebar.issueFilters.defaults.myOpen',
    query: 'is:open author:@me',
  },
]

/** Label to display for a filter — the user's own name, or the built-in's translated one. */
export function issueFilterLabel(
  filter: IssueFilter,
  t: (key: string) => string
): string {
  if (filter.name.trim()) return filter.name
  return filter.labelKey ? t(filter.labelKey) : ''
}

function newFilterId(): string {
  return `filter-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

interface IssueFiltersState {
  /** Ordered — the order is the order of the sub-groups in the sidebar. */
  filters: IssueFilter[]
  /** Appends a filter and returns its generated id. */
  addFilter: (input: { name: string; query: string }) => string
  /** Renames / re-queries a filter. Renaming drops `labelKey`, so a built-in keeps the new name. */
  updateFilter: (id: string, patch: { name?: string; query?: string }) => void
  removeFilter: (id: string) => void
  /** Moves a filter one slot up or down. A no-op at either end of the list. */
  moveFilter: (id: string, direction: 'up' | 'down') => void
}

export const useIssueFiltersStore = create<IssueFiltersState>()(
  persist(
    (set) => ({
      filters: DEFAULT_ISSUE_FILTERS,

      addFilter: ({ name, query }) => {
        const id = newFilterId()
        set((state) => ({
          filters: [...state.filters, { id, name: name.trim(), query: query.trim() }],
        }))
        return id
      },

      updateFilter: (id, patch) =>
        set((state) => ({
          filters: state.filters.map((f) => {
            if (f.id !== id) return f
            const next: IssueFilter = { ...f }
            if (patch.name !== undefined) {
              next.name = patch.name.trim()
              // A user-typed name replaces the built-in label for good; keeping `labelKey` would
              // silently restore the English/French default the next time the app renders it.
              if (next.name) delete next.labelKey
            }
            if (patch.query !== undefined) next.query = patch.query.trim()
            return next
          }),
        })),

      removeFilter: (id) =>
        set((state) => ({ filters: state.filters.filter((f) => f.id !== id) })),

      moveFilter: (id, direction) =>
        set((state) => {
          const index = state.filters.findIndex((f) => f.id === id)
          const target = direction === 'up' ? index - 1 : index + 1
          if (index === -1 || target < 0 || target >= state.filters.length) return state
          const filters = [...state.filters]
          ;[filters[index], filters[target]] = [filters[target], filters[index]]
          return { filters }
        }),
    }),
    { name: 'git-manager-issue-filters' }
  )
)
