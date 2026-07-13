import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface HoverExpandLabelProps {
  /** Texte affiché (tronqué normalement, complet au survol s'il déborde). */
  children: React.ReactNode
  /** Classes appliquées au texte (tronqué ET overlay) pour rester cohérent. */
  className?: string
  /** Classe supplémentaire sur le conteneur. */
  containerClassName?: string
}

/**
 * Affiche un texte tronqué qui révèle son contenu complet au survol **uniquement
 * s'il déborde réellement** (mesure `scrollWidth > clientWidth`).
 *
 * L'overlay complet est rendu en `position: fixed` via un portail au niveau du
 * `body`, positionné à partir du `getBoundingClientRect` du texte tronqué : il
 * échappe ainsi à tout `overflow: hidden` de la sidebar / ScrollArea et ne peut
 * pas être clippé ni « perdre » son état d'affichage.
 */
export function HoverExpandLabel({
  children,
  className = '',
  containerClassName = '',
}: HoverExpandLabelProps) {
  const textRef = useRef<HTMLSpanElement>(null)
  const [overlay, setOverlay] = useState<{
    top: number
    left: number
    height: number
    /** Police calculée du texte de la ligne (le portail n'hérite pas du CSS). */
    fontSize: string
    fontFamily: string
    fontWeight: string
    fontStyle: string
    letterSpacing: string
    lineHeight: string
  } | null>(null)

  // Snapshot (position + police) du texte tronqué, afin que l'overlay (rendu dans
  // un portail sur body) ait une police pixel-identique à la ligne. On lit les
  // propriétés une par une car le raccourci `font` renvoie souvent "" sous WebKit.
  // La hauteur/position verticale suivent la ligne entière (wrapper [data-index]
  // du virtualizer) pour matcher la hauteur de l'élément sélectionné.
  const measure = () => {
    const el = textRef.current
    if (!el) return null
    const cs = getComputedStyle(el)
    const textRect = el.getBoundingClientRect()
    const rowEl = el.closest('[data-index]') as HTMLElement | null
    const rowRect = (rowEl ?? el).getBoundingClientRect()
    return {
      top: rowRect.top,
      left: textRect.left,
      height: rowRect.height,
      fontSize: cs.fontSize,
      fontFamily: cs.fontFamily,
      fontWeight: cs.fontWeight,
      fontStyle: cs.fontStyle,
      letterSpacing: cs.letterSpacing,
      lineHeight: cs.lineHeight,
    }
  }

  const showOverlay = () => {
    const el = textRef.current
    if (!el) return
    // Pas de débordement → pas d'overlay.
    if (el.scrollWidth <= el.clientWidth + 1) return
    setOverlay(measure())
  }

  const hideOverlay = () => setOverlay(null)

  // Repositionne / masque l'overlay si la fenêtre bouge pendant le survol.
  useLayoutEffect(() => {
    if (!overlay) return
    const update = () => setOverlay(measure())
    window.addEventListener('scroll', hideOverlay, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', hideOverlay, true)
      window.removeEventListener('resize', update)
    }
  }, [overlay])

  return (
    <div
      className={`relative min-w-0 flex-1 ${containerClassName}`}
      onMouseEnter={showOverlay}
      onMouseLeave={hideOverlay}
    >
      <span ref={textRef} className={`block truncate ${className}`}>
        {children}
      </span>

      {overlay &&
        createPortal(
          // Base opaque = fond de la sidebar (bg-sidebar) pour masquer le contenu
          // dessous, puis la couleur de hover par défaut (bg-sidebar-accent/60 +
          // text-sidebar-foreground) par-dessus → même ligne, même design. La police
          // est copiée du texte (le portail n'hérite pas du CSS → sinon taille du
          // body, trop grande). La hauteur matche la ligne entière (élément
          // sélectionné).
          <span
            className="pointer-events-none fixed z-[100] flex items-center whitespace-nowrap bg-sidebar text-sidebar-foreground"
            style={{
              top: overlay.top,
              height: overlay.height,
              left: overlay.left,
              fontSize: overlay.fontSize,
              fontFamily: overlay.fontFamily,
              fontWeight: overlay.fontWeight,
              fontStyle: overlay.fontStyle,
              letterSpacing: overlay.letterSpacing,
              lineHeight: overlay.lineHeight,
            }}
          >
            <span className="flex h-full items-center whitespace-nowrap bg-sidebar-accent/60 pr-2">
              {children}
            </span>
          </span>,
          document.body
        )}
    </div>
  )
}
