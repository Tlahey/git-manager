import { createContext, useContext, type ReactNode } from 'react'
import { highlightMatch, normalizeForSearch } from '../../../lib/highlightMatch'

/**
 * The active settings-search query, already normalized (lowercased, accent-stripped) — `''` when the
 * user isn't searching. Provided by `SettingsPage` around the section content so individual settings
 * can filter/highlight themselves without prop-drilling.
 */
const SettingsSearchContext = createContext<string>('')

export function SettingsSearchProvider({
  query,
  children,
}: {
  /** The normalized query (see `normalizeForSearch`). */
  query: string
  children: ReactNode
}) {
  return <SettingsSearchContext.Provider value={query}>{children}</SettingsSearchContext.Provider>
}

/** The active normalized settings-search query (`''` when not searching). */
export function useSettingsSearch(): string {
  return useContext(SettingsSearchContext)
}

interface FilterableSettingProps {
  /** The searchable text for this setting: its visible label plus any synonym keywords. When a query
   * is active and doesn't match this, the setting is hidden. */
  match: string
  /** Wrapper class (usually the setting's own spacing container, e.g. `space-y-2`). */
  className?: string
  testId?: string
  children: ReactNode
}

/**
 * Wraps one setting so it disappears when the active search query doesn't match its `match` text.
 * Renders its children unchanged when there's no query (so a non-searching user sees everything, and
 * existing tests are unaffected). Pair with `<Highlight>` on the visible label to emphasise the hit.
 */
export function FilterableSetting({ match, className, testId, children }: FilterableSettingProps) {
  const query = useSettingsSearch()
  if (query !== '' && !normalizeForSearch(match).includes(query)) return null
  return (
    <div className={className} data-testid={testId}>
      {children}
    </div>
  )
}

/** Renders `text` with the active search query highlighted (accent-insensitive). No-op when idle. */
export function Highlight({ text }: { text: string }) {
  const query = useSettingsSearch()
  return <>{highlightMatch(text, query)}</>
}
