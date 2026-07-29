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
  issueFilterLabel,
  useIssueFiltersStore,
  type IssueFilter,
} from '../../stores/issueFilters.store'

interface IssueFilterDialogProps {
  open: boolean
  /** The filter being edited, or `null` to create a new one. */
  filter: IssueFilter | null
  onClose: () => void
}

/**
 * Creates or edits one saved issue filter — a name and a raw GitHub issue-search query.
 *
 * The query is deliberately a plain text field rather than a builder: it is sent to GitHub verbatim,
 * so every qualifier GitHub's own search box accepts works here, including ones this app has never
 * heard of. `repo:` and `is:issue` are added by the fetch layer, which is why the hint says not to
 * repeat them.
 */
export function IssueFilterDialog({ open, filter, onClose }: IssueFilterDialogProps) {
  const { t } = useTranslation('git')
  const addFilter = useIssueFiltersStore((s) => s.addFilter)
  const updateFilter = useIssueFiltersStore((s) => s.updateFilter)

  const [name, setName] = useState('')
  const [query, setQuery] = useState('')

  // Seed the fields when the dialog opens: the built-in filters have no `name` of their own, so an
  // edit starts from the label the user actually sees rather than an empty box.
  useEffect(() => {
    if (!open) return
    setName(filter ? issueFilterLabel(filter, t) : '')
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
      <DialogContent data-testid="issue-filter-dialog" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {filter ? t('sidebar.issueFilters.editTitle') : t('sidebar.issueFilters.addTitle')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-1">
            <label className="block text-xs text-muted-foreground" htmlFor="issue-filter-name">
              {t('sidebar.issueFilters.nameLabel')}
            </label>
            <Input
              id="issue-filter-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('sidebar.issueFilters.namePlaceholder')}
              data-testid="issue-filter-name-input"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs text-muted-foreground" htmlFor="issue-filter-query">
              {t('sidebar.issueFilters.queryLabel')}
            </label>
            <Input
              id="issue-filter-query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="is:open assignee:@me"
              className="font-mono"
              data-testid="issue-filter-query-input"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmit()
              }}
            />
            <p className="text-[11px] text-muted-foreground">
              {t('sidebar.issueFilters.queryHint')}
            </p>
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
            data-testid="issue-filter-confirm-button"
          >
            {filter ? t('sidebar.issueFilters.save') : t('sidebar.issueFilters.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
