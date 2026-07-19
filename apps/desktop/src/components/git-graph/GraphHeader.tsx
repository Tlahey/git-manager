import { useRef } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { ContextMenu, ContextMenuTrigger } from '@git-manager/ui'
import { Network } from 'lucide-react'
import { useGitGraphColumnsStore } from '../../stores/gitGraphColumns.store'
import { useSettingsStore } from '../../stores/settings.store'
import { HeaderColumnsMenu } from './HeaderColumnsMenu'
import { isGraphCompact } from './graphColumnSizing'
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
  const rowHeightSetting = useSettingsStore((s) => s.settings.appearance.rowHeight || 'standard')
  const avatarSize = rowHeightSetting === 'small' ? 24 : 32

  const drag = useRef<{
    key: ColumnKey
    startX: number
    startWidth: number
    maxWidth?: number
  } | null>(null)

  function handleResizeDown(e: React.PointerEvent, col: ResolvedColumn, fromLeft = false) {
    e.preventDefault()
    e.stopPropagation()
    drag.current = { key: col.key, startX: e.clientX, startWidth: col.width, maxWidth: col.maxWidth }

    function onMove(ev: PointerEvent) {
      if (!drag.current) return
      const delta = ev.clientX - drag.current.startX
      let newWidth = fromLeft ? drag.current.startWidth - delta : drag.current.startWidth + delta
      // La colonne graph ne s'élargit pas au-delà de ce que son contenu occupe réellement.
      if (drag.current.maxWidth !== undefined) newWidth = Math.min(newWidth, drag.current.maxWidth)
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

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="flex h-7 shrink-0 select-none items-stretch border-b border-border bg-muted/40 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {columns.map((col, idx) => {
            const prevCol = idx > 0 ? columns[idx - 1] : null
            const isAfterFlex = prevCol?.flex ?? false
            // En largeur compacte le libellé "Graph" ne tient plus : on affiche une icône.
            const showGraphIcon = col.key === 'graph' && isGraphCompact(col.width, avatarSize)

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

                {showGraphIcon ? (
                  <Network className="h-3.5 w-3.5 shrink-0" aria-label={t(col.labelKey)} />
                ) : (
                  <span className="truncate">{t(col.labelKey)}</span>
                )}

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
      </ContextMenuTrigger>

      <HeaderColumnsMenu />
    </ContextMenu>
  )
}
