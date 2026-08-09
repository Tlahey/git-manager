import { useTranslation } from '@git-manager/i18n'
import { Check } from 'lucide-react'
import { ContextMenuContent, ContextMenuItem, ContextMenuLabel } from '@git-manager/ui'
import { useGitGraphColumnsStore } from '../../../stores/gitGraphColumns.store'
import { COLUMN_DEFS, COLUMN_ORDER } from '../lib/columns.config'

/** Right-click menu on the header: show / hide columns. */
export function HeaderColumnsMenu() {
  const { t } = useTranslation('git')
  const columns = useGitGraphColumnsStore((s) => s.columns)
  const setVisibility = useGitGraphColumnsStore((s) => s.setVisibility)

  const visibleCount = COLUMN_ORDER.filter((k) => columns[k].visible).length

  return (
    <ContextMenuContent className="w-52">
      <ContextMenuLabel>{t('gitTree.columns.menuTitle')}</ContextMenuLabel>
      {COLUMN_ORDER.map((key) => {
        const isVisible = columns[key].visible
        // Prevent hiding the last visible column.
        const disabled = isVisible && visibleCount === 1
        return (
          <ContextMenuItem
            key={key}
            disabled={disabled}
            onSelect={() => setVisibility(key, !isVisible)}
          >
            <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
              {isVisible && <Check className="h-3.5 w-3.5 text-primary" />}
            </span>
            <span className="truncate">{t(COLUMN_DEFS[key].labelKey)}</span>
          </ContextMenuItem>
        )
      })}
    </ContextMenuContent>
  )
}
