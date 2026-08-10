import { useState } from 'react'
import { Layers, Plus } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { useLaunchpadStore, type SavedFilter } from '../stores/launchpad.store'
import { prMatchesSavedFilter, issueMatchesSavedFilter } from '../lib/savedFilterMatch'
import { SavedFilterList } from './SavedFilterList'
import { CustomViewResults } from './CustomViewResults'
import { FilterEditorDialog } from './FilterEditorDialog'
import type { MockPR, MockIssue } from '../../../lib/github/types'

interface CustomViewsTabProps {
  allPRs: MockPR[]
  allIssues: MockIssue[]
  pinnedIds: Set<string>
  onTogglePin: (id: string) => void
  loading: boolean
}

/**
 * The Custom Views tab: saved filters on the left, the selected one's matches on the right.
 *
 * This component is the wiring — which view is selected, whether the editor is open and on what.
 * The rail, the results and the matching rules are `SavedFilterList`, `CustomViewResults` and
 * `lib/savedFilterMatch.ts`.
 */
export function CustomViewsTab({
  allPRs,
  allIssues,
  pinnedIds,
  onTogglePin,
  loading,
}: CustomViewsTabProps) {
  const { t } = useTranslation('launchpad')
  const { savedFilters, addFilter, updateFilter, deleteFilter } = useLaunchpadStore()
  const [activeFilterId, setActiveFilterId] = useState<string | null>(savedFilters[0]?.id ?? null)
  const [showEditor, setShowEditor] = useState(false)
  const [editingFilter, setEditingFilter] = useState<SavedFilter | null>(null)

  const activeFilter = savedFilters.find((f) => f.id === activeFilterId) ?? null

  function openEditor(filter: SavedFilter | null) {
    setEditingFilter(filter)
    setShowEditor(true)
  }

  function handleDelete(id: string) {
    deleteFilter(id)
    // Deleting the selected view leaves the right pane pointing at nothing, so fall through to
    // whichever view survives — or to the empty state when it was the last one.
    if (activeFilterId === id) {
      setActiveFilterId(savedFilters.find((f) => f.id !== id)?.id ?? null)
    }
  }

  function countForFilter(f: SavedFilter): number {
    const prCount =
      f.type === 'issues' ? 0 : allPRs.filter((pr) => prMatchesSavedFilter(pr, f)).length
    const issueCount =
      f.type === 'prs' ? 0 : allIssues.filter((issue) => issueMatchesSavedFilter(issue, f)).length
    return prCount + issueCount
  }

  return (
    <div className="flex h-full overflow-hidden">
      <SavedFilterList
        filters={savedFilters}
        activeFilterId={activeFilterId}
        onSelect={setActiveFilterId}
        onCreate={() => openEditor(null)}
        onEdit={openEditor}
        onDelete={handleDelete}
        countFor={countForFilter}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {activeFilter ? (
          <>
            <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card/30 px-4 py-2.5">
              <span className="text-base">{activeFilter.emoji}</span>
              <span className="text-sm font-semibold text-foreground">{activeFilter.name}</span>
              <span className="text-[10px] text-muted-foreground/60 capitalize">
                —{' '}
                {activeFilter.type === 'both'
                  ? t('views.typeBoth')
                  : activeFilter.type === 'prs'
                    ? t('filterEditor.typePrs')
                    : t('filterEditor.typeIssues')}
              </span>
            </div>
            <CustomViewResults
              filter={activeFilter}
              allPRs={allPRs}
              allIssues={allIssues}
              pinnedIds={pinnedIds}
              onTogglePin={onTogglePin}
              loading={loading}
            />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-muted-foreground/50">
            <Layers className="h-8 w-8 opacity-20" />
            <div className="text-center">
              <p className="text-sm font-medium">{t('views.noFilterSelected')}</p>
              <p className="mt-1 text-xs">{t('views.createToStart')}</p>
            </div>
            <button
              onClick={() => openEditor(null)}
              className="flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-4 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
            >
              <Plus className="h-3.5 w-3.5" /> {t('views.newFilter')}
            </button>
          </div>
        )}
      </div>

      {showEditor && (
        <FilterEditorDialog
          initial={
            editingFilter
              ? {
                  name: editingFilter.name,
                  emoji: editingFilter.emoji,
                  type: editingFilter.type,
                  titleContains: editingFilter.titleContains,
                  authorContains: editingFilter.authorContains,
                  repo: editingFilter.repo,
                  labelContains: editingFilter.labelContains,
                  statuses: editingFilter.statuses,
                  needsMyReview: editingFilter.needsMyReview,
                }
              : undefined
          }
          onSave={(draft) => {
            if (editingFilter) updateFilter(editingFilter.id, draft)
            else addFilter(draft)
          }}
          onClose={() => {
            setShowEditor(false)
            setEditingFilter(null)
          }}
        />
      )}
    </div>
  )
}
