import { useEffect, useRef } from 'react'
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { useCommitSearchStore } from '../../stores/commitSearch.store'

interface CommitSearchPanelProps {
  /** Number of commits matching the current query (only meaningful once the query is non-empty). */
  resultCount: number
  /** 0-based index of the currently focused match within the result set. */
  activeIndex: number
  onPrevious: () => void
  onNext: () => void
}

/** Floating commit search panel, anchored top-right of the graph content area (⌘F). */
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

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  if (!open) return null

  const hasQuery = query.trim().length > 0
  const hasResults = hasQuery && resultCount > 0

  return (
    <div
      className="absolute right-3 top-3 z-40 flex h-9 items-center gap-1.5 rounded-md border border-border bg-popover px-2.5 shadow-lg"
      data-testid="commit-search-panel"
    >
      <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <input
        ref={inputRef}
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
        className="w-48 min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        data-testid="commit-search-input"
      />
      {hasQuery && (
        <span
          className="shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground"
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
        className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        data-testid="commit-search-prev"
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={!hasResults}
        aria-label={t('toolbar.searchNext')}
        className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        data-testid="commit-search-next"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={closeSearch}
        aria-label={t('toolbar.cancel')}
        className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        data-testid="commit-search-close"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
