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

  const isLocalMain = (r: GitRef) =>
    r.type === 'branch' && (r.shortName === 'main' || r.shortName === 'master')
  const isRemoteMain = (r: GitRef) =>
    r.type === 'remote' && (r.shortName.endsWith('/main') || r.shortName.endsWith('/master'))

  // When a non-main local branch sits on the SAME commit as a main ref — local main OR origin/main,
  // whichever is present (the local main is often a couple commits behind, so origin/main is the
  // one actually on the branch tip) — surface that branch instead: it becomes the primary badge and
  // the main ref(s) fall into the "+N" overflow (revealed on hover). Otherwise the usual priority
  // applies (local main first).
  const branchWithMain =
    refs.some((r) => isLocalMain(r) || isRemoteMain(r)) &&
    refs.some((r) => r.type === 'branch' && !isLocalMain(r))

  const hasLocalBranch = refs.some((r) => r.type === 'branch')
  const hasRemoteMain = refs.some(isRemoteMain)
  const visibleRefs = refs.filter((r) => {
    // The bare HEAD pointer is redundant whenever a local branch already marks this commit — the
    // branch badge shows where HEAD is. Keep it only for a detached HEAD (no branch here).
    if (r.type === 'HEAD' && hasLocalBranch) return false
    // A branch coexisting with both local main and origin/main gets a single "main" in the overflow:
    // drop the local main duplicate (origin/main stays).
    if (branchWithMain && isLocalMain(r) && hasRemoteMain) return false
    return true
  })

  // Lower rank = shown earlier. `branchWithMain` promotes the coexisting branch ahead of main.
  const rank = (r: GitRef): number => {
    const otherLocalBranch = r.type === 'branch' && !isLocalMain(r)
    if (branchWithMain) {
      if (otherLocalBranch) return 0
      if (isLocalMain(r)) return 1
      if (isRemoteMain(r)) return 2
      if (r.type === 'remote') return 3
      return 4 // tags / anything else (HEAD already filtered out)
    }
    if (isLocalMain(r)) return 0
    if (isRemoteMain(r)) return 1
    if (otherLocalBranch) return 2
    if (r.type === 'remote') return 3
    if (r.type === 'HEAD') return 4
    return 5 // tags last
  }

  // Stable sort (V8 Array.sort is stable) keeps input order within a rank tier.
  const sortedRefs = [...visibleRefs].sort((a, b) => rank(a) - rank(b))

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
            className="z-popover flex max-w-xs flex-col items-start gap-1 rounded-md border border-border bg-popover p-1.5 shadow-lg"
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
