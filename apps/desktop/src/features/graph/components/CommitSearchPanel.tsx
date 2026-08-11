import { useEffect, useRef } from 'react'
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react'
import { Input } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { useCommitSearchStore } from '../../../stores/commitSearch.store'

interface CommitSearchPanelProps {
  /** Number of commits matching the current query (only meaningful once the query is non-empty). */
  resultCount: number
  /** 0-based index of the currently focused match within the result set. */
  activeIndex: number
  onPrevious: () => void
  onNext: () => void
}

/**
 * Commit search (⌘F), floating over the top-right of the graph content area.
 *
 * **The one search in the app shaped like this**, and the reason is what it does: it *steps through*
 * matches — Enter and the arrows walk them, the counter says where you are — over a list that stays
 * whole. The files and board views filter their list in place instead, so their search is a field in
 * the panel holding the list, where it can say what it narrowed. A floating panel there would hover
 * over the very rows it was removing.
 *
 * This briefly lived on a shared `FloatingSearchPanel` in `packages/components`, extracted when the
 * three views all had one. They no longer do, and a shared component with a single consumer
 * advertises a reuse that isn't there — so the markup came home.
 */
export function CommitSearchPanel({
  resultCount,
  activeIndex,
  onPrevious,
  onNext,
}: CommitSearchPanelProps) {
  const { t } = useTranslation('git')
  const open = useCommitSearchStore((s) => s.open)
  const query = useCommitSearchStore((s) => s.query)
  const setQuery = useCommitSearchStore((s) => s.setQuery)
  const closeSearch = useCommitSearchStore((s) => s.closeSearch)
  const inputRef = useRef<HTMLInputElement>(null)

  // Opening a search that isn't focused means asking the user to click the thing they just opened.
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  if (!open) return null

  const hasQuery = query.trim().length > 0
  const hasResults = hasQuery && resultCount > 0
  const stepButton =
    'shrink-0 cursor-pointer rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent'

  return (
    <div
      className="absolute top-3 right-3 z-panel flex h-9 items-center gap-1.5 rounded-md border border-border bg-popover px-2.5 shadow-lg"
      data-testid="commit-search-panel"
    >
      <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      {/* `ghost` rather than the shared `SearchInput`: this field is one segment of a stepper, and
          the ✕ that component exists to standardise would land beside the panel's own ✕ meaning
          something else. The primitive still buys the graded placeholder, the focus behaviour and
          the autocorrect defaults a bare `<input>` was dropping. */}
      <Input
        ref={inputRef}
        variant="ghost"
        inputSize="sm"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            closeSearch()
          } else if (e.key === 'Enter') {
            e.preventDefault()
            if (e.shiftKey) onPrevious()
            else onNext()
          }
        }}
        placeholder={t('toolbar.findCommit')}
        aria-label={t('toolbar.findCommit')}
        className="w-48 min-w-0 px-0"
        data-testid="commit-search-panel-input"
      />
      {hasQuery && (
        <span
          className="shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular-nums"
          data-testid="commit-search-count"
        >
          {hasResults ? `${activeIndex + 1}/${resultCount}` : '0/0'}
        </span>
      )}
      <button
        type="button"
        onClick={onPrevious}
        disabled={!hasResults}
        aria-label={t('toolbar.searchPrevious')}
        className={stepButton}
        data-testid="commit-search-prev"
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={!hasResults}
        aria-label={t('toolbar.searchNext')}
        className={stepButton}
        data-testid="commit-search-next"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={closeSearch}
        aria-label={t('toolbar.cancel')}
        className="shrink-0 cursor-pointer rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        data-testid="commit-search-panel-close"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
