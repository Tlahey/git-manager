import { useRef } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { ContextMenu, ContextMenuTrigger, cn } from '@git-manager/ui'
import { Network, Calendar, Hash } from 'lucide-react'
import { useGitGraphColumnsStore } from '../../stores/gitGraphColumns.store'
import { useSettingsStore } from '../../stores/settings.store'
import { HeaderColumnsMenu } from './HeaderColumnsMenu'
import { isGraphCompact } from './graphColumnSizing'
import type { ResolvedColumn } from './columns.config'

interface GraphHeaderProps {
  /** Colonnes visibles, dans l'ordre, avec largeurs résolues. */
  columns: ResolvedColumn[]
}

/** En dessous de cette largeur (px), les colonnes date/sha affichent une icône
 * compacte à la place de leur libellé texte (même principe que la colonne graph
 * via `isGraphCompact`). */
const COMPACT_LABEL_MAX_WIDTH = 72

/** Icône d'en-tête affichée en mode compact, par colonne. */
const COMPACT_LABEL_ICON = { date: Calendar, sha: Hash } as const

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

  const rowRef = useRef<HTMLDivElement>(null)

  // Largeur RÉELLEMENT rendue d'une colonne (celle de la colonne flex n'est pas
  // fiable dans `col.width` — flexbox la calcule à l'affichage). On la mesure sur
  // le DOM pour connaître la marge de rétrécissement du flex.
  function renderedWidth(col: ResolvedColumn) {
    const el = rowRef.current?.querySelector<HTMLElement>(`[data-col-key="${col.key}"]`)
    const w = el?.getBoundingClientRect().width ?? 0
    return w > 0 ? w : col.width
  }

  // Redimensionnement « splitter » : une poignée vit à la frontière entre deux
  // colonnes adjacentes (`leftCol` | `rightCol`) et transfère la largeur de l'une
  // à l'autre — `leftCol` grandit de `delta`, `rightCol` rétrécit d'autant. La
  // somme reste constante, donc SEULE cette frontière bouge : aucune colonne
  // distante ne se décale. Si l'un des deux côtés est la colonne flex (message),
  // on ne touche que le côté fixe et le flex absorbe localement la différence.
  function handleResizeDown(e: React.PointerEvent, leftCol: ResolvedColumn, rightCol: ResolvedColumn) {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startLeft = leftCol.width
    const startRight = rightCol.width
    const leftFixed = !leftCol.flex
    const rightFixed = !rightCol.flex
    // Taille rendue de la colonne flex voisine (au plus une des deux l'est) au
    // début du drag — sa marge de rétrécissement avant d'atteindre son minWidth.
    const leftFlexStart = leftFixed ? 0 : renderedWidth(leftCol)
    const rightFlexStart = rightFixed ? 0 : renderedWidth(rightCol)

    // Borne le delta pour que ni `leftCol` ni `rightCol` ne franchisse son min/max.
    // Côté fixe : clamp sur son propre min/max. Côté flex : il absorbe la variation
    // opposée (+delta à gauche, -delta à droite) et ne doit pas descendre sous son
    // minWidth — sinon il ne peut plus absorber et la ligne déborde (date/sha
    // sortent du contenu). C'est cette borne-là qui arrête le resize à la limite.
    function clampDelta(delta: number) {
      if (leftFixed) {
        const maxL = leftCol.maxWidth ?? Number.POSITIVE_INFINITY
        delta = Math.min(delta, maxL - startLeft)
        delta = Math.max(delta, leftCol.minWidth - startLeft)
      } else {
        // leftCol (flex) varie de +delta → reste >= son minWidth.
        delta = Math.max(delta, leftCol.minWidth - leftFlexStart)
      }
      if (rightFixed) {
        const maxR = rightCol.maxWidth ?? Number.POSITIVE_INFINITY
        delta = Math.max(delta, startRight - maxR)
        delta = Math.min(delta, startRight - rightCol.minWidth)
      } else {
        // rightCol (flex) varie de -delta → reste >= son minWidth.
        delta = Math.min(delta, rightFlexStart - rightCol.minWidth)
      }
      return delta
    }

    function onMove(ev: PointerEvent) {
      const delta = clampDelta(ev.clientX - startX)
      if (leftFixed) setWidth(leftCol.key, startLeft + delta)
      if (rightFixed) setWidth(rightCol.key, startRight - delta)
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={rowRef}
          className="flex h-7 shrink-0 select-none items-stretch border-b border-border bg-muted/40 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {columns.map((col, idx) => {
            // Poignée à la frontière avec la colonne suivante (aucune après la dernière).
            const nextCol = columns[idx + 1]
            // Sous une certaine largeur, on remplace le libellé texte par une icône :
            // graph (marqueur seul) via `isGraphCompact`, date/sha via un seuil de largeur.
            const HeaderIcon =
              col.key === 'graph'
                ? isGraphCompact(col.width, avatarSize)
                  ? Network
                  : null
                : (col.key === 'date' || col.key === 'sha') && col.width < COMPACT_LABEL_MAX_WIDTH
                  ? COMPACT_LABEL_ICON[col.key]
                  : null

            return (
              <div
                key={col.key}
                data-col-key={col.key}
                // Le box-model d'espacement doit être STRICTEMENT identique à celui des
                // cellules de contenu (GraphRow) — mêmes marges/paddings par colonne — sinon
                // l'en-tête et le contenu dérivent colonne après colonne (le `mx-2` ajoute
                // 16px de plus que le `px-2` à chaque cellule) et les libellés ne tombent plus
                // au-dessus de la bonne colonne.
                className={cn(
                  'relative flex min-w-0 items-center',
                  col.key === 'refs' ? 'justify-start pl-2' : 'mx-2',
                  col.key === 'graph' && 'px-0'
                )}
                style={
                  col.flex
                    ? { flex: '1 1 0%', minWidth: col.minWidth }
                    : { width: col.width, flexShrink: 0 }
                }
              >
                {HeaderIcon ? (
                  <HeaderIcon className="h-3.5 w-3.5 shrink-0" aria-label={t(col.labelKey)} />
                ) : (
                  <span className="truncate">{t(col.labelKey)}</span>
                )}

                {/* Poignée de redimensionnement à la frontière `col` | `nextCol` (splitter). */}
                {nextCol && (
                  <div
                    onPointerDown={(e) => handleResizeDown(e, col, nextCol)}
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
