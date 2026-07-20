import { Search, X, Layers, Circle, Pencil, ArrowUpDown } from 'lucide-react'
import { Input } from '@git-manager/ui'
import { MultiSelectDropdown } from '@git-manager/components'
import { useTranslation } from '@git-manager/i18n'
import type { SortKey, SortDir } from '../types'

interface ToolbarProps {
  search: string
  onSearch: (v: string) => void
  sortKey: SortKey
  sortDir: SortDir
  onSort: (k: SortKey) => void
  statusFilter: Set<string>
  onToggleStatus: (s: string) => void
  onClearStatus: () => void
  repoFilter: Set<string>
  onToggleRepo: (r: string) => void
  onClearRepo: () => void
  authorFilter: Set<string>
  onToggleAuthor: (a: string) => void
  onClearAuthor: () => void
  repos: string[]
  statuses: string[]
  authors: string[]
  children?: React.ReactNode
}

export function Toolbar({
  search,
  onSearch,
  sortKey,
  sortDir,
  onSort,
  statusFilter,
  onToggleStatus,
  onClearStatus,
  repoFilter,
  onToggleRepo,
  onClearRepo,
  authorFilter,
  onToggleAuthor,
  onClearAuthor,
  repos,
  statuses,
  authors,
  children,
}: ToolbarProps) {
  const { t } = useTranslation('launchpad')
  const filterDropdownLabels = {
    clearAllLabel: t('filter.clearAll'),
    emptyLabel: t('filter.noOptions'),
    selectedLabel: (n: number) => t('filter.selected', { count: n }),
  }
  const totalActiveFilters = statusFilter.size + repoFilter.size + authorFilter.size

  function clearAll() {
    onClearStatus()
    onClearRepo()
    onClearAuthor()
  }

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/5 px-4 py-2">
      {/* Search */}
      <div className="relative max-w-xs flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={t('toolbar.searchPlaceholder')}
          className="h-7 w-full border-border bg-card pl-7 pr-6 text-xs shadow-none focus:ring-1 focus:ring-primary/40"
        />
        {search && (
          <button
            onClick={() => onSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Separator */}
      <div className="mx-0.5 h-4 w-px bg-border/60" />

      {/* Quick filter dropdowns */}
      <MultiSelectDropdown
        label={t('table.repo')}
        icon={<Layers className="h-3 w-3" />}
        options={repos}
        selected={repoFilter}
        onToggle={onToggleRepo}
        onClear={onClearRepo}
        {...filterDropdownLabels}
      />
      <MultiSelectDropdown
        label={t('table.status')}
        icon={<Circle className="h-3 w-3" />}
        options={statuses}
        selected={statusFilter}
        onToggle={onToggleStatus}
        onClear={onClearStatus}
        {...filterDropdownLabels}
      />
      <MultiSelectDropdown
        label={t('table.author')}
        icon={<Pencil className="h-3 w-3" />}
        options={authors}
        selected={authorFilter}
        onToggle={onToggleAuthor}
        onClear={onClearAuthor}
        {...filterDropdownLabels}
      />

      {/* Clear all badge */}
      {totalActiveFilters > 0 && (
        <button
          onClick={clearAll}
          className="flex h-6 items-center gap-1 rounded-md border border-transparent px-2 text-[10px] text-muted-foreground transition-all hover:border-destructive/20 hover:bg-destructive/5 hover:text-destructive"
        >
          <X className="h-2.5 w-2.5" /> {t('toolbar.clearAllCount', { count: totalActiveFilters })}
        </button>
      )}

      {/* Separator */}
      <div className="mx-0.5 h-4 w-px bg-border/60" />

      {/* Sort buttons */}
      <div className="flex items-center gap-1">
        {(['date', 'status', 'author', 'repo', 'files'] as SortKey[]).map((k) => (
          <button
            key={k}
            onClick={() => onSort(k)}
            className={`flex h-7 items-center gap-1 rounded border px-2 text-[10px] transition-colors ${
              sortKey === k
                ? 'border-primary/30 bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {k === 'date'
              ? t('sort.date')
              : k === 'status'
                ? t('table.status')
                : k === 'author'
                  ? t('table.author')
                  : k === 'repo'
                    ? t('table.repo')
                    : t('sort.files')}
            {sortKey === k && (
              <ArrowUpDown
                className="h-2.5 w-2.5"
                style={{ transform: sortDir === 'asc' ? 'scaleY(1)' : 'scaleY(-1)' }}
              />
            )}
          </button>
        ))}
      </div>
      {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
    </div>
  )
}
