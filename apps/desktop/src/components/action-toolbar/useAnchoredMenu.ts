import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export type MenuAlign = 'left' | 'right'

interface AnchoredMenuOptions {
  /** Alignement horizontal du menu par rapport au trigger. */
  align?: MenuAlign
  /** Décalage vertical sous le trigger (px). */
  offset?: number
}

/**
 * Gère l'état ouvert/fermé d'un menu déroulant ancré sur un bouton :
 * positionnement en `position: fixed` (rendu via portal), fermeture au clic
 * extérieur et à la touche Échap. Mutualise la logique répétée dans la barre
 * d'actions (RepoSelector, FetchButton, UserProfile...).
 */
export function useAnchoredMenu({ align = 'left', offset = 6 }: AnchoredMenuOptions = {}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const top = rect.bottom + offset
    const left = align === 'right' ? rect.right : rect.left
    setPos({ top, left })
  }, [open, align, offset])

  useEffect(() => {
    if (!open) return

    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node
      const inTrigger = containerRef.current?.contains(target)
      const inMenu = menuRef.current?.contains(target)
      if (!inTrigger && !inMenu) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return { open, setOpen, pos, align, containerRef, triggerRef, menuRef }
}
