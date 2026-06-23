import { useCallback, useEffect, useRef, useState } from 'react'

export interface ContextMenuPosition {
  x: number
  y: number
}

/**
 * Gère un menu contextuel ancré à une position libre du curseur (clic droit ou
 * icône ⋮), rendu via portal en `position: fixed`. Fermeture au clic extérieur
 * et à la touche Échap. À la différence de `useAnchoredMenu` (ancré au rect d'un
 * bouton trigger), la position est fournie explicitement via `openAt(x, y)`.
 */
export function useContextMenu() {
  const [position, setPosition] = useState<ContextMenuPosition | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const openAt = useCallback((x: number, y: number) => {
    setPosition({ x, y })
  }, [])

  const close = useCallback(() => setPosition(null), [])

  useEffect(() => {
    if (!position) return

    function onPointerDown(e: PointerEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setPosition(null)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setPosition(null)
    }
    function onScroll() {
      setPosition(null)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    // Ferme si la liste scrolle sous le menu (capture pour attraper le scroll interne).
    document.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('scroll', onScroll, true)
    }
  }, [position])

  return { position, isOpen: position !== null, openAt, close, menuRef }
}
