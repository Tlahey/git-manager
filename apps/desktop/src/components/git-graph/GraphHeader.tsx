import { useRef } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { useGitGraphColumnsStore } from '../../stores/gitGraphColumns.store'
import { useContextMenu } from '../../hooks/useContextMenu'
import { HeaderColumnsMenu } from './HeaderColumnsMenu'
import type { ResolvedColumn } from './columns'
import type { ColumnKey } from './columns'

interface GraphHeaderProps {
  /** Colonnes visibles, dans l'ordre, avec largeurs résolues. */
  columns: ResolvedColumn[]
}

/**
 * En-tête du tableau virtuel : libellés des colonnes, poignées de
 * redimensionnement, et menu contextuel (clic droit) pour afficher / masquer
 * les colonnes.
 */
export function GraphHeader({ columns }: GraphHeaderProps) {
  const { t } = useTranslation('git')
  const setWidth = useGitGraphColumnsStore((s) => s.setWidth)
  const menu = useContextMenu()

  const drag = useRef<{ key: ColumnKey; startX: number; startWidth: number } | null>(null)

  function handleResizeDown(e: React.PointerEvent, col: ResolvedColumn, fromLeft = false) {
    e.preventDefault()
    e.stopPropagation()
    drag.current = { key: col.key, startX: e.clientX, startWidth: col.width }

    function onMove(ev: PointerEvent) {
      if (!drag.current) return
      const delta = ev.clientX - drag.current.startX
      const newWidth = fromLeft ? drag.current.startWidth - delta : drag.current.startWidth + delta
      setWidth(drag.current.key, newWidth)
    }
    function onUp() {
      drag.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    menu.openAt(e.clientX, e.clientY)
  }

  return (
    <>
      <div
        onContextMenu={handleContextMenu}
        className="flex h-7 shrink-0 select-none items-stretch border-b border-border bg-muted/40 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
      >
        {columns.map((col, idx) => {
          const prevCol = idx > 0 ? columns[idx - 1] : null
          const isAfterFlex = prevCol?.flex ?? false

          return (
            <div
              key={col.key}
              className="relative flex min-w-0 items-center px-2"
              style={col.flex ? { flex: '1 1 0%' } : { width: col.width, flexShrink: 0 }}
            >
              {/* Poignée de redimensionnement sur la gauche (si la colonne précédente est flex) */}
              {isAfterFlex && (
                <div
                  onPointerDown={(e) => handleResizeDown(e, col, true)}
                  className="group absolute left-0 top-0 z-10 h-full w-2 -translate-x-1/2 cursor-col-resize"
                >
                  <div className="mx-auto h-full w-px bg-border transition-colors group-hover:bg-primary/60" />
                </div>
              )}

              <span className="truncate">{t(col.labelKey)}</span>

              {/* Poignée de redimensionnement sur la droite (sauf colonne flex) */}
              {!col.flex && (
                <div
                  onPointerDown={(e) => handleResizeDown(e, col, false)}
                  className="group absolute right-0 top-0 z-10 h-full w-2 translate-x-1/2 cursor-col-resize"
                >
                  <div className="mx-auto h-full w-px bg-border transition-colors group-hover:bg-primary/60" />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {menu.isOpen && menu.position && (
        <HeaderColumnsMenu position={menu.position} menuRef={menu.menuRef} />
      )}
    </>
  )
}
