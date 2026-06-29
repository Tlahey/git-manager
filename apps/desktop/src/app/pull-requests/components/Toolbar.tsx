import { Search, X, Layers, Circle, Pencil, ArrowUpDown } from 'lucide-react'
import { MultiSelectDropdown } from './MultiSelectDropdown'
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
}: ToolbarProps) {
  const totalActiveFilters = statusFilter.size + repoFilter.size + authorFilter.size

  function clearAll() {
    onClearStatus()
    onClearRepo()
    onClearAuthor()
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/5 shrink-0">
      {/* Search */}
      <div className="relative flex-1 max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search…"
          className="w-full pl-7 pr-6 h-7 rounded-md border border-border bg-card text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
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
      <div className="h-4 w-px bg-border/60 mx-0.5" />

      {/* Quick filter dropdowns */}
      <MultiSelectDropdown
        label="Repo"
        icon={<Layers className="h-3 w-3" />}
        options={repos}
        selected={repoFilter}
        onToggle={onToggleRepo}
        onClear={onClearRepo}
      />
      <MultiSelectDropdown
        label="Status"
        icon={<Circle className="h-3 w-3" />}
        options={statuses}
        selected={statusFilter}
        onToggle={onToggleStatus}
        onClear={onClearStatus}
      />
      <MultiSelectDropdown
        label="Author"
        icon={<Pencil className="h-3 w-3" />}
        options={authors}
        selected={authorFilter}
        onToggle={onToggleAuthor}
        onClear={onClearAuthor}
      />

      {/* Clear all badge */}
      {totalActiveFilters > 0 && (
        <button
          onClick={clearAll}
          className="flex items-center gap-1 h-6 px-2 rounded-md text-[10px] text-muted-foreground hover:text-destructive hover:bg-destructive/5 border border-transparent hover:border-destructive/20 transition-all"
        >
          <X className="h-2.5 w-2.5" /> Clear all ({totalActiveFilters})
        </button>
      )}

      {/* Separator */}
      <div className="h-4 w-px bg-border/60 mx-0.5" />

      {/* Sort buttons */}
      <div className="flex items-center gap-1">
        {(['date', 'status', 'author', 'repo', 'files'] as SortKey[]).map((k) => (
          <button
            key={k}
            onClick={() => onSort(k)}
            className={`flex items-center gap-1 h-7 px-2 rounded border text-[10px] transition-colors ${
              sortKey === k
                ? 'bg-primary/10 border-primary/30 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {k === 'date'
              ? 'Date'
              : k === 'status'
                ? 'Status'
                : k === 'author'
                  ? 'Author'
                  : k === 'repo'
                    ? 'Repo'
                    : 'Files'}
            {sortKey === k && (
              <ArrowUpDown
                className="h-2.5 w-2.5"
                style={{ transform: sortDir === 'asc' ? 'scaleY(1)' : 'scaleY(-1)' }}
              />
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
