import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { GitRef } from '@git-manager/git-types'
import { RefLabel } from './RefLabel'

interface RefLabelGroupProps {
  refs: GitRef[]
  color?: string
}

/**
 * Affiche un seul ref par défaut. S'il y en a plusieurs, un badge « +N » est
 * ajouté ; au survol, l'ensemble des refs est révélé dans un panneau flottant
 * (portal) positionné juste en dessous.
 */
export function RefLabelGroup({ refs, color }: RefLabelGroupProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const badgeRef = useRef<HTMLSpanElement>(null)

  if (refs.length === 0) return null

  // Trier les références pour afficher les branches clés (main) en premier et les tags en dernier
  const sortedRefs = [...refs].sort((a, b) => {
    // 1. Local main branch first
    const isLocalMainA = a.type === 'branch' && a.shortName === 'main'
    const isLocalMainB = b.type === 'branch' && b.shortName === 'main'
    if (isLocalMainA && !isLocalMainB) return -1
    if (!isLocalMainA && isLocalMainB) return 1

    // 2. Remote main branch second
    const isRemoteMainA = a.type === 'remote' && a.shortName.endsWith('/main')
    const isRemoteMainB = b.type === 'remote' && b.shortName.endsWith('/main')
    if (isRemoteMainA && !isRemoteMainB) return -1
    if (!isRemoteMainA && isRemoteMainB) return 1

    // 3. Other local branches
    if (a.type === 'branch' && b.type !== 'branch') return -1
    if (a.type !== 'branch' && b.type === 'branch') return 1

    // 4. Other remote branches
    if (a.type === 'remote' && b.type !== 'remote') return -1
    if (a.type !== 'remote' && b.type === 'remote') return 1

    // 5. HEAD
    if (a.type === 'HEAD' && b.type !== 'HEAD') return -1
    if (a.type !== 'HEAD' && b.type === 'HEAD') return 1

    // 6. Tags last
    return 0
  })

  const first = sortedRefs[0]
  const extra = sortedRefs.length - 1

  function show() {
    const el = badgeRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({ top: r.bottom, left: r.left })
    setOpen(true)
  }
  function hide() {
    setOpen(false)
  }

  return (
    // `max-w-full` borne le groupe à la largeur de la colonne « refs » : la ligne
    // de connexion voisine porte une marge droite négative qui rendrait sinon
    // l'espace libre flex positif, empêchant le groupe de rétrécir — les badges
    // déborderaient alors par-dessus la colonne graphe au redimensionnement.
    <div className="flex min-w-0 max-w-full items-center gap-1 overflow-hidden">
      <RefLabel gitRef={first} color={color} />

      {extra > 0 && (
        <span
          ref={badgeRef}
          onMouseEnter={show}
          onMouseLeave={hide}
          data-testid="ref-label-group-more-badge"
          className="inline-flex shrink-0 cursor-default items-center rounded border border-border bg-muted px-1.5 py-0 text-[11px] font-medium leading-5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          +{extra}
        </span>
      )}

      {open &&
        extra > 0 &&
        createPortal(
          <div
            style={{ position: 'fixed', top: pos.top, left: pos.left }}
            onMouseEnter={show}
            onMouseLeave={hide}
            data-testid="ref-label-group-more-popover"
            className="z-50 flex max-w-xs flex-col items-start gap-1 rounded-md border border-border bg-popover p-1.5 shadow-lg"
          >
            {sortedRefs.slice(1).map((ref, i) => (
              <RefLabel key={i} gitRef={ref} color={color} />
            ))}
          </div>,
          document.body
        )}
    </div>
  )
}
