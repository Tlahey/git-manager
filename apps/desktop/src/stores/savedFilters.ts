import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * One saved view of a repository's issues or pull requests, shown as a sub-group in the sidebar.
 *
 * `query` is raw **GitHub search syntax** (`is:open assignee:@me`, `label:bug -label:wontfix`, …)
 * and is sent to GitHub verbatim rather than evaluated locally — the point of the feature is that
 * anything expressible in GitHub's own search box works here, including qualifiers this app has
 * never heard of. The `repo:` and `is:issue` / `is:pr` qualifiers are added by the fetch layer, so
 * a filter never has to restate which repository or which kind it applies to.
 */
export interface SavedFilter {
  id: string
  /** User-chosen label. Empty for a built-in filter, whose label comes from {@link SavedFilter.labelKey}. */
  name: string
  /**
   * i18n key (in the `git` namespace) naming a built-in filter. Set only on the filters shipped by
   * default, and dropped as soon as the user renames one — a name the user typed is their own text,
   * not a translatable string.
   */
  labelKey?: string
  query: string
}

/** Label to display for a filter — the user's own name, or the built-in's translated one. */
export function savedFilterLabel(filter: SavedFilter, t: (key: string) => string): string {
  if (filter.name.trim()) return filter.name
  return filter.labelKey ? t(filter.labelKey) : ''
}

function newFilterId(): string {
  return `filter-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export interface SavedFiltersState {
  /** Ordered — the order is the order of the sub-groups in the sidebar. */
  filters: SavedFilter[]
  /** Appends a filter and returns its generated id. */
  addFilter: (input: { name: string; query: string }) => string
  /** Renames / re-queries a filter. Renaming drops `labelKey`, so a built-in keeps the new name. */
  updateFilter: (id: string, patch: { name?: string; query?: string }) => void
  removeFilter: (id: string) => void
  /** Moves a filter one slot up or down. A no-op at either end of the list. */
  moveFilter: (id: string, direction: 'up' | 'down') => void
}

/**
 * Builds a persisted store of saved filters.
 *
 * The issue and pull request lists want exactly the same behaviour over different defaults and a
 * different storage key, so they share one implementation: a second hand-written copy is how the
 * two would drift on the details that are easy to get subtly wrong (trimming, what a rename does to
 * a built-in's label, the no-op at the ends of the list).
 */
export function createSavedFiltersStore(persistName: string, defaults: SavedFilter[]) {
  return create<SavedFiltersState>()(
    persist(
      (set) => ({
        filters: defaults,

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
              const next: SavedFilter = { ...f }
              if (patch.name !== undefined) {
                next.name = patch.name.trim()
                // A user-typed name replaces the built-in label for good; keeping `labelKey` would
                // silently restore the English/French default the next time it is rendered.
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
      { name: persistName }
    )
  )
}
