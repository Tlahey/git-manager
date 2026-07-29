import { useCallback } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { showNativeMenu } from '../api/nativeMenu.api'
import { buildIssueFilterMenuSpec } from '../lib/issueContextMenus'
import { useIssueFiltersStore, type IssueFilter } from '../stores/issueFilters.store'
import type { IssueFilterMenuTarget } from '../components/repository-sidebar/types'

/**
 * The menu behind a saved issue filter's own button, on its sub-group header: edit, delete, and
 * reorder within the Issues section.
 *
 * Deleting takes effect immediately, with no confirmation: a filter is a saved query, not repository
 * state — nothing about the repo or GitHub changes, and re-typing one costs a sentence. Editing is
 * the caller's business (it owns the dialog), so it is passed in rather than raised from here.
 */
export function useSidebarIssueFilterMenu(onEditFilter: (filter: IssueFilter) => void) {
  const { t } = useTranslation('git')
  const removeFilter = useIssueFiltersStore((s) => s.removeFilter)
  const moveFilter = useIssueFiltersStore((s) => s.moveFilter)

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
