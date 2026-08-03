import { useEffect, useState } from 'react'
import {
  Button,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import {
  savedFilterLabel,
  type SavedFilter,
  type SavedFiltersState,
} from '../../stores/savedFilters'

/** Which list the dialog is editing — picks the wording, nothing else. */
export type SavedFilterKind = 'issues' | 'prs'

const COPY: Record<SavedFilterKind, { addTitle: string; editTitle: string; hint: string }> = {
  issues: {
    addTitle: 'sidebar.issueFilters.addTitle',
    editTitle: 'sidebar.issueFilters.editTitle',
    hint: 'sidebar.issueFilters.queryHint',
  },
  prs: {
    addTitle: 'sidebar.prFilters.addTitle',
    editTitle: 'sidebar.prFilters.editTitle',
    hint: 'sidebar.prFilters.queryHint',
  },
}

interface SavedFilterDialogProps {
  open: boolean
  /** Picks the wording; the behaviour is identical either way. */
  kind?: SavedFilterKind
  /** The filter being edited, or `null` to create a new one. */
  filter: SavedFilter | null
  /** The store to write to — the issue list and the pull request list each have their own. */
  useStore: <T>(selector: (state: SavedFiltersState) => T) => T
  onClose: () => void
}

/**
 * Creates or edits one saved filter — a name and a raw GitHub search query. Shared by the Issues
 * and Pull Requests sections, which differ only in the store they write to.
 *
 * The query is deliberately a plain text field rather than a builder: it is sent to GitHub verbatim,
 * so every qualifier GitHub's own search box accepts works here, including ones this app has never
 * heard of. `repo:` and `is:issue` / `is:pr` are added by the fetch layer, which is why the hint
 * says not to repeat them.
 */
export function SavedFilterDialog({
  open,
  kind = 'issues',
  filter,
  useStore,
  onClose,
}: SavedFilterDialogProps) {
  const { t } = useTranslation('git')
  const copy = COPY[kind]
  const addFilter = useStore((s) => s.addFilter)
  const updateFilter = useStore((s) => s.updateFilter)

  const [name, setName] = useState('')
  const [query, setQuery] = useState('')

  // Seed the fields when the dialog opens: the built-in filters have no `name` of their own, so an
  // edit starts from the label the user actually sees rather than an empty box.
  useEffect(() => {
    if (!open) return
    setName(filter ? savedFilterLabel(filter, t) : '')
    setQuery(filter?.query ?? '')
  }, [open, filter, t])

  const canSubmit = name.trim().length > 0 && query.trim().length > 0

  function handleOpenChange(next: boolean) {
    if (!next) onClose()
  }

  function handleSubmit() {
    if (!canSubmit) return
    if (filter) updateFilter(filter.id, { name, query })
    else addFilter({ name, query })
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent data-testid="saved-filter-dialog" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{filter ? t(copy.editTitle) : t(copy.addTitle)}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-1">
            <label className="block text-xs text-muted-foreground" htmlFor="saved-filter-name">
              {t('sidebar.issueFilters.nameLabel')}
            </label>
            <Input
              id="saved-filter-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('sidebar.issueFilters.namePlaceholder')}
              data-testid="saved-filter-name-input"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs text-muted-foreground" htmlFor="saved-filter-query">
              {t('sidebar.issueFilters.queryLabel')}
            </label>
            <Input
              id="saved-filter-query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="is:open assignee:@me"
              className="font-mono"
              data-testid="saved-filter-query-input"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmit()
              }}
            />
            <p className="text-[11px] text-muted-foreground">{t(copy.hint)}</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => handleOpenChange(false)}>
            {t('gitTree.contextMenu.cancel')}
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!canSubmit}
            data-testid="saved-filter-confirm-button"
          >
            {filter ? t('sidebar.issueFilters.save') : t('sidebar.issueFilters.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
