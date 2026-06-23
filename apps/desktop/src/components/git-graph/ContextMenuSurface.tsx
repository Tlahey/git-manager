import { forwardRef } from 'react'
import { createPortal } from 'react-dom'
import type { ContextMenuPosition } from '../../hooks/useContextMenu'

interface ContextMenuSurfaceProps {
  position: ContextMenuPosition
  width?: number
  children: React.ReactNode
}

/**
 * Surface flottante (portal) d'un menu contextuel ancré à la position du curseur.
 * Clampe horizontalement aux bords de l'écran et bascule l'ancrage vers le haut
 * lorsque le clic est dans la moitié basse de la fenêtre (évite le débordement).
 */
export const ContextMenuSurface = forwardRef<HTMLDivElement, ContextMenuSurfaceProps>(
  function ContextMenuSurface({ position, width = 232, children }, ref) {
    const margin = 8
    const left = Math.max(margin, Math.min(position.x, window.innerWidth - width - margin))
    const openUp = position.y > window.innerHeight * 0.6

    const vertical = openUp
      ? { bottom: Math.max(margin, window.innerHeight - position.y) }
      : { top: Math.max(margin, position.y) }

    return createPortal(
      <div
        ref={ref}
        style={{ position: 'fixed', left, width, maxHeight: '70vh', ...vertical }}
        className="z-50 flex flex-col overflow-y-auto rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-lg"
      >
        {children}
      </div>,
      document.body,
    )
  }
)
