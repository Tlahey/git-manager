import { useCallback } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { showNativeMenu } from '../../../api/nativeMenu.api'
import { buildIssueFilterMenuSpec } from '../../../lib/issueContextMenus'
import type { SavedFilter, SavedFiltersState } from '../stores/savedFilters'
import type { IssueFilterMenuTarget } from '../sidebar/types'

/**
 * The menu behind a saved filter's own button, on its sub-group header: edit, delete, and reorder.
 * Shared by the Issues and Pull Requests sections, which differ only in the store passed in.
 *
 * Deleting takes effect immediately, with no confirmation: a filter is a saved query, not repository
 * state — nothing about the repo or GitHub changes, and re-typing one costs a sentence. Editing is
 * the caller's business (it owns the dialog), so it is passed in rather than raised from here.
 */
export function useSavedFilterMenu(
  useStore: <T>(selector: (state: SavedFiltersState) => T) => T,
  onEditFilter: (filter: SavedFilter) => void
) {
  const { t } = useTranslation('git')
  const removeFilter = useStore((s) => s.removeFilter)
  const moveFilter = useStore((s) => s.moveFilter)

  return useCallback(
    (e: React.MouseEvent, target: IssueFilterMenuTarget) => {
      e.preventDefault()
      e.stopPropagation()
      void showNativeMenu(
        buildIssueFilterMenuSpec(
          { canMoveUp: !!target.canMoveUp, canMoveDown: !!target.canMoveDown },
          {
            onEdit: () => onEditFilter(target.filter),
            onDelete: () => removeFilter(target.filter.id),
            onMoveUp: () => moveFilter(target.filter.id, 'up'),
            onMoveDown: () => moveFilter(target.filter.id, 'down'),
          },
          t
        )
      ).catch(console.error)
    },
    [onEditFilter, removeFilter, moveFilter, t]
  )
}
