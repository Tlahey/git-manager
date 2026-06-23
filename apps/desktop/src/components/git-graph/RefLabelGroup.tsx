import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { GitRef } from '@git-manager/git-types'
import { RefLabel } from './RefLabel'

interface RefLabelGroupProps {
  refs: GitRef[]
}

/**
 * Affiche un seul ref par défaut. S'il y en a plusieurs, un badge « +N » est
 * ajouté ; au survol, l'ensemble des refs est révélé dans un panneau flottant
 * (portal) positionné juste en dessous.
 */
export function RefLabelGroup({ refs }: RefLabelGroupProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const badgeRef = useRef<HTMLSpanElement>(null)

  if (refs.length === 0) return null

  const first = refs[0]
  const extra = refs.length - 1

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
    <div className="flex min-w-0 items-center gap-1 overflow-hidden">
      <RefLabel gitRef={first} />

      {extra > 0 && (
        <span
          ref={badgeRef}
          onMouseEnter={show}
          onMouseLeave={hide}
          className="inline-flex shrink-0 cursor-default items-center rounded border border-border bg-muted px-1.5 py-0 text-[10px] leading-5 font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
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
            className="z-50 flex max-w-xs flex-col items-start gap-1 rounded-md border border-border bg-popover p-1.5 shadow-lg"
          >
            {refs.slice(1).map((ref, i) => (
              <RefLabel key={i} gitRef={ref} />
            ))}
          </div>,
          document.body,
        )}
    </div>
  )
}
