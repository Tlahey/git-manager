import { useTranslation } from '@git-manager/i18n'
import { Check } from 'lucide-react'
import { useGitGraphColumnsStore } from '../../stores/gitGraphColumns.store'
import { COLUMN_DEFS, COLUMN_ORDER } from './columns'
import { ContextMenuSurface } from './ContextMenuSurface'
import type { ContextMenuPosition } from '../../hooks/useContextMenu'

interface HeaderColumnsMenuProps {
  position: ContextMenuPosition
  menuRef: React.RefObject<HTMLDivElement>
}

/** Menu (clic droit sur l'en-tête) pour afficher / masquer les colonnes. */
export function HeaderColumnsMenu({ position, menuRef }: HeaderColumnsMenuProps) {
  const { t } = useTranslation('git')
  const columns = useGitGraphColumnsStore((s) => s.columns)
  const setVisibility = useGitGraphColumnsStore((s) => s.setVisibility)

  const visibleCount = COLUMN_ORDER.filter((k) => columns[k].visible).length

  return (
    <ContextMenuSurface position={position} ref={menuRef} width={208}>
      <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {t('gitTree.columns.menuTitle')}
      </div>
      {COLUMN_ORDER.map((key) => {
        const isVisible = columns[key].visible
        // Empêche de masquer la dernière colonne visible.
        const disabled = isVisible && visibleCount === 1
        return (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => setVisibility(key, !isVisible)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
              {isVisible && <Check className="h-3.5 w-3.5 text-primary" />}
            </span>
            <span className="truncate">{t(COLUMN_DEFS[key].labelKey)}</span>
          </button>
        )
      })}
    </ContextMenuSurface>
  )
}
