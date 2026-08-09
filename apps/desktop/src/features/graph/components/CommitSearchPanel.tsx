import { ChevronUp, ChevronDown } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { FloatingSearchPanel } from '@git-manager/components'
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
 * Commit search (⌘F), anchored top-right of the graph content area.
 *
 * The shape is `FloatingSearchPanel`, shared with the files and board views so the three searches
 * look and behave alike. What is the graph's own is the *stepping*: this search walks matches with
 * Enter and the arrows below, where the other two filter their list in place — which is why the
 * counter and the arrows are passed in rather than built into the shared panel.
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

  const hasQuery = query.trim().length > 0
  const hasResults = hasQuery && resultCount > 0
  const stepButton =
    'shrink-0 cursor-pointer rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent'

  return (
    <FloatingSearchPanel
      open={open}
      value={query}
      onValueChange={setQuery}
      onClose={closeSearch}
      placeholder={t('toolbar.findCommit')}
      closeLabel={t('toolbar.cancel')}
      onNext={onNext}
      onPrevious={onPrevious}
      testId="commit-search-panel"
    >
      {hasQuery && (
        <span
          className="text-muted-foreground shrink-0 text-xs whitespace-nowrap tabular-nums"
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
    </FloatingSearchPanel>
  )
}
