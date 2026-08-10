import { useState } from 'react'
import { Plus, Layers, Pencil, Trash2 } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import type { SavedFilter } from '../stores/launchpad.store'

interface SavedFilterListProps {
  filters: SavedFilter[]
  activeFilterId: string | null
  onSelect: (id: string) => void
  onCreate: () => void
  onEdit: (filter: SavedFilter) => void
  onDelete: (id: string) => void
  /** How many PRs + issues the given view currently matches, shown as its badge. */
  countFor: (filter: SavedFilter) => number
}

/**
 * The custom views' left rail: every saved view with its match count, the row actions to edit or
 * delete one, and — under the list — a plain-language summary of what the selected view filters on.
 *
 * Owns exactly one piece of state, the two-step delete confirmation, because nothing outside this
 * rail can see or act on a half-pressed delete. Everything else is the tab's, passed down.
 */
export function SavedFilterList({
  filters,
  activeFilterId,
  onSelect,
  onCreate,
  onEdit,
  onDelete,
  countFor,
}: SavedFilterListProps) {
  const { t } = useTranslation('launchpad')
  // Clicking the bin arms it; a second click on the same row confirms. Reset once it fires so the
  // next delete asks again.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const activeFilter = filters.find((f) => f.id === activeFilterId) ?? null

  return (
    <div className="flex w-52 shrink-0 flex-col border-r border-border bg-muted/5">
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
          {t('views.savedFilters')}
        </span>
        <button
          onClick={onCreate}
          data-testid="launchpad-new-filter-button"
          className="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
          title={t('views.newFilter')}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {filters.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 px-3 py-8 text-muted-foreground/50">
            <Layers className="h-5 w-5 opacity-30" />
            <p className="text-center text-[10px]">
              {t('views.noFiltersTitle')}
              <br />
              {t('views.noFiltersHint')}
            </p>
          </div>
        )}
        {filters.map((f) => {
          const isActive = f.id === activeFilterId
          return (
            <div
              key={f.id}
              data-testid={`saved-filter-${f.name}`}
              className={`group/filter relative flex cursor-pointer items-center gap-2 px-3 py-2 transition-colors ${
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
              }`}
              onClick={() => onSelect(f.id)}
            >
              <span className="shrink-0 text-sm">{f.emoji}</span>
              <span className="flex-1 truncate text-xs font-medium">{f.name}</span>
              <span
                className={`shrink-0 rounded-full px-1.5 py-px text-[9px] leading-none font-bold ${
                  isActive ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                }`}
              >
                {countFor(f)}
              </span>
              <div className="absolute right-1 hidden items-center gap-0.5 group-hover/filter:flex">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onEdit(f)
                  }}
                  className="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                  title={t('views.edit')}
                >
                  <Pencil className="h-2.5 w-2.5" />
                </button>
                {confirmDeleteId === f.id ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(f.id)
                      setConfirmDeleteId(null)
                    }}
                    className="flex h-5 cursor-pointer items-center justify-center rounded bg-destructive/10 px-1 text-[9px] font-medium text-destructive"
                  >
                    {t('views.confirm')}
                  </button>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setConfirmDeleteId(f.id)
                    }}
                    className="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    title={t('views.delete')}
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {activeFilter && <SavedFilterCriteria filter={activeFilter} />}
    </div>
  )
}

/** What the selected view filters on, one line per criterion — the readable form of the editor's
 * fields, so the list can be trusted without reopening the dialog. */
function SavedFilterCriteria({ filter }: { filter: SavedFilter }) {
  const { t } = useTranslation('launchpad')
  const hasNoCriteria =
    !filter.titleContains &&
    !filter.authorContains &&
    !filter.repo &&
    !filter.labelContains &&
    !filter.statuses?.length &&
    filter.needsMyReview === undefined

  return (
    <div className="space-y-1.5 border-t border-border px-3 py-3">
      <p className="text-[9px] font-semibold tracking-wider text-muted-foreground/60 uppercase">
        {t('views.criteria')}
      </p>
      {filter.titleContains && (
        <p className="text-[10px] text-muted-foreground">
          <span className="font-medium text-foreground/70">{t('views.criteriaTitle')}</span> &quot;
          {filter.titleContains}&quot;
        </p>
      )}
      {filter.authorContains && (
        <p className="text-[10px] text-muted-foreground">
          <span className="font-medium text-foreground/70">{t('views.criteriaAuthor')}</span>{' '}
          {filter.authorContains}
        </p>
      )}
      {filter.repo && (
        <p className="text-[10px] text-muted-foreground">
          <span className="font-medium text-foreground/70">{t('views.criteriaRepo')}</span>{' '}
          {filter.repo}
        </p>
      )}
      {filter.labelContains && (
        <p className="text-[10px] text-muted-foreground">
          <span className="font-medium text-foreground/70">{t('views.criteriaLabel')}</span>{' '}
          {filter.labelContains}
        </p>
      )}
      {(filter.statuses?.length ?? 0) > 0 && (
        <p className="text-[10px] text-muted-foreground">
          <span className="font-medium text-foreground/70">{t('views.criteriaStatus')}</span>{' '}
          {filter.statuses?.join(', ')}
        </p>
      )}
      {filter.needsMyReview === true && (
        <p className="text-[10px] text-muted-foreground">{t('filterEditor.needsMyReview')}</p>
      )}
      {hasNoCriteria && (
        <p className="text-[10px] text-muted-foreground/40 italic">{t('views.noCriteria')}</p>
      )}
    </div>
  )
}
