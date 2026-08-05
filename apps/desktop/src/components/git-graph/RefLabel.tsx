import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { GitRef } from '@git-manager/git-types'
import { cn, GithubMark } from '@git-manager/ui'
import { GitCommitHorizontal, Check, Laptop, Tag, Archive } from 'lucide-react'
import { useRefDragStore, isValidRefDropTarget, isSameRef } from '../../stores/refDrag.store'
import { useRefDropHandler } from './useRefDropHandler'

interface RefLabelProps {
  gitRef: GitRef
  color?: string
  /**
   * Whether this badge takes part in drag-and-drop. `false` for the faint *lane hint* badges
   * `GraphRow` renders on every commit of a branch's lane — they mustn't each pop the drag overlay
   * when their branch is the drop target (that looked like every tag being hovered at once). Only
   * the real ref badge (at the branch tip) is interactive. Defaults to `true`.
   */
  interactive?: boolean
  /**
   * Fill the parent's width instead of capping at the inline badge width. Used by
   * `RefLabelGroup`'s hover panel, where the stacked badges span the panel and the full ref name
   * must stay readable (no truncation).
   */
  expand?: boolean
}

const cleanName = (ref: GitRef) => {
  if (ref.type === 'remote') {
    const parts = ref.shortName.split('/')
    if (parts.length > 1) {
      return parts.slice(1).join('/')
    }
  }
  return ref.shortName
}

export function RefLabel({ gitRef, color, interactive = true, expand = false }: RefLabelProps) {
  const isHEAD = gitRef.type === 'HEAD'
  const isRemote = gitRef.type === 'remote'
  const isTag = gitRef.type === 'tag'
  const isStash = gitRef.type === 'stash'

  const displayName = cleanName(gitRef)
  const label = isHEAD ? 'HEAD' : displayName

  // Hovering a truncated (ellipsized) badge reveals its full name in a clone of the badge rendered
  // `position: fixed` through a portal — same idea as the left panel's HoverExpandLabel: same
  // style/color, pinned to the same spot but with no max width or truncation, so the whole text
  // fits. Overflow is measured on demand (`scrollWidth > clientWidth`) and the overlay only opens
  // when the label actually overflows.
  const badgeRef = useRef<HTMLSpanElement>(null)
  const nameRef = useRef<HTMLSpanElement>(null)
  const [overlayPos, setOverlayPos] = useState<{ top: number; left: number } | null>(null)
  // Hovering a badge darkens its tinted background (stronger alpha) so the hovered ref stands out —
  // especially among the stacked badges of RefLabelGroup's hover panel.
  const [hovered, setHovered] = useState(false)

  const showOverlay = () => {
    const nameEl = nameRef.current
    const badgeEl = badgeRef.current
    if (!nameEl || !badgeEl) return
    if (nameEl.scrollWidth <= nameEl.clientWidth + 1) return // no overflow
    const r = badgeEl.getBoundingClientRect()
    setOverlayPos({ top: r.top, left: r.left })
  }
  const hideOverlay = () => setOverlayPos(null)

  // A scroll / resize during hover would move the badge, so hide the overlay rather than let it
  // float at the wrong spot.
  useLayoutEffect(() => {
    if (!overlayPos) return
    window.addEventListener('scroll', hideOverlay, true)
    window.addEventListener('resize', hideOverlay)
    return () => {
      window.removeEventListener('scroll', hideOverlay, true)
      window.removeEventListener('resize', hideOverlay)
    }
  }, [overlayPos])

  // ── Drag-and-drop (branch/tag onto another ref) ────────────────────────────
  // Only real, mutable refs take part — never the bare HEAD pointer or a stash.
  const onDropRefs = useRefDropHandler()
  // A real tag badge is tagged with `data-ref-tag` so the row's context-menu handler can detect a
  // right-click landing on it and open the tag menu instead of the commit menu (see GraphRow).
  const tagRefAttr = interactive && isTag ? gitRef.shortName : undefined
  // WKWebView does not deliver `contextmenu` to a permanently-`draggable` element (the right-click
  // is retargeted past the badge, so the row opened the commit menu instead of the tag menu). The
  // badge is therefore inert by default and only *armed* as draggable while the left button is held
  // — which is the only window a native HTML5 drag can start in anyway. React flushes the discrete
  // `mousedown` synchronously, so `draggable` is set before the drag-start movement threshold.
  const [dragArmed, setDragArmed] = useState(false)
  useEffect(() => {
    if (!dragArmed) return
    // Disarm on release anywhere (the badge's own mouseup misses a release outside it). A drag that
    // did start ends through `handleDragEnd`, which also disarms.
    const disarm = () => setDragArmed(false)
    window.addEventListener('mouseup', disarm)
    return () => window.removeEventListener('mouseup', disarm)
  }, [dragArmed])
  const startDrag = useRefDragStore((s) => s.startDrag)
  const endDrag = useRefDragStore((s) => s.endDrag)
  const setHoverRef = useRefDragStore((s) => s.setHoverRef)
  const hoverRef = useRefDragStore((s) => s.hoverRef)
  const canDragDrop = interactive && !!onDropRefs && !isHEAD && !isStash
  // This badge is the current (sticky) drop target — drives its highlight ring + full-name overlay.
  const isDropTarget = canDragDrop && isSameRef(hoverRef, gitRef)

  // While this badge is the sticky drag target, force its full-name overlay on (the native drag
  // suppresses the mouse events the hover overlay normally rides on) and clear it when it stops
  // being the target — switched to another ref, dropped, or cancelled.
  useEffect(() => {
    if (!isDropTarget) return
    const badgeEl = badgeRef.current
    if (!badgeEl) return
    const r = badgeEl.getBoundingClientRect()
    setOverlayPos({ top: r.top, left: r.left })
    return () => setOverlayPos(null)
  }, [isDropTarget])

  const handleDragStart = (e: React.DragEvent) => {
    startDrag(gitRef)
    // A custom type marks this as our drag so a target can allow the drop in `dragover`, where the
    // payload itself is unreadable; the source ref is read from the store on drop.
    e.dataTransfer.setData('application/x-gm-ref', gitRef.name)
    e.dataTransfer.effectAllowed = 'copy'

    // Explicit drag image: a floating copy of the badge follows the cursor. We clone the live badge
    // (rendered off-screen so it isn't visible in place) rather than trusting the default snapshot,
    // which WKWebView renders inconsistently for small inline elements.
    const el = badgeRef.current
    if (el && typeof e.dataTransfer.setDragImage === 'function') {
      const clone = el.cloneNode(true) as HTMLElement
      clone.style.position = 'fixed'
      clone.style.top = '-1000px'
      clone.style.left = '-1000px'
      clone.style.margin = '0'
      clone.style.opacity = '0.9'
      clone.style.pointerEvents = 'none'
      document.body.appendChild(clone)
      e.dataTransfer.setDragImage(clone, 12, 12)
      // Remove once the browser has snapshotted it for the drag.
      setTimeout(() => clone.remove(), 0)
    }
  }
  // Little flourish: after the drop, a ghost of the badge glides from where it was dropped back to
  // its home spot in the list. Purely cosmetic — the real badge never moved.
  const animateBackHome = (dropX: number, dropY: number) => {
    const el = badgeRef.current
    // Some engines report 0,0 for a keyboard-/cancel-ended drag — skip the flourish then.
    if (!el || (dropX === 0 && dropY === 0)) return
    const home = el.getBoundingClientRect()
    if (home.width === 0) return
    const ghost = el.cloneNode(true) as HTMLElement
    const startLeft = dropX - home.width / 2
    const startTop = dropY - home.height / 2
    Object.assign(ghost.style, {
      position: 'fixed',
      margin: '0',
      left: `${startLeft}px`,
      top: `${startTop}px`,
      pointerEvents: 'none',
      zIndex: '9999',
      transition: 'transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1)',
    })
    document.body.appendChild(ghost)
    requestAnimationFrame(() => {
      ghost.style.transform = `translate(${home.left - startLeft}px, ${home.top - startTop}px)`
    })
    const cleanup = () => ghost.remove()
    ghost.addEventListener('transitionend', cleanup, { once: true })
    setTimeout(cleanup, 500) // fallback if the drop landed on home (no transition to end)
  }

  const handleDragEnd = (e: React.DragEvent) => {
    animateBackHome(e.clientX, e.clientY)
    endDrag() // clears draggingRef + the sticky hoverRef → every target's highlight/overlay resets
    setDragArmed(false) // back to the inert (right-clickable) state
  }
  const handleDragOver = (e: React.DragEvent) => {
    if (isValidRefDropTarget(useRefDragStore.getState().draggingRef, gitRef)) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy' // green "+" cursor
    }
  }
  const handleDragEnter = () => {
    // Entering a valid target makes it *the* sticky target: its highlight/overlay persists until
    // another target is entered or the drag ends — we deliberately don't clear it on drag-leave.
    if (isValidRefDropTarget(useRefDragStore.getState().draggingRef, gitRef)) setHoverRef(gitRef)
  }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const dragging = useRefDragStore.getState().draggingRef
    if (onDropRefs && dragging && isValidRefDropTarget(dragging, gitRef)) {
      onDropRefs(dragging, gitRef)
    }
  }

  const isLocalMainOrMaster = gitRef.shortName === 'main' || gitRef.shortName === 'master'

  const isRemoteMainOrMaster =
    gitRef.shortName.endsWith('/main') || gitRef.shortName.endsWith('/master')

  let refColor = color || '#2563eb'
  if (isLocalMainOrMaster) {
    refColor = '#2563eb'
  } else if (isRemoteMainOrMaster) {
    refColor = '#7c3aed'
  } else if (isStash) {
    refColor = '#a78bfa'
  }

  let badgeClasses = cn(
    'inline-flex min-w-0 items-center gap-1 rounded px-1.5 py-0 text-[11px] leading-5 font-medium border bg-background transition-all duration-150'
  )

  // Custom inline styles for coloring (non-HEAD)
  const customStyle: React.CSSProperties = {}

  if (isHEAD) {
    badgeClasses = cn(badgeClasses, 'text-emerald-300 border-emerald-500/40 font-semibold')
    const headAlpha = hovered ? 0.35 : 0.2
    customStyle.backgroundImage = `linear-gradient(rgba(16, 185, 129, ${headAlpha}), rgba(16, 185, 129, ${headAlpha}))`
  } else {
    // ~15% opacity overlay over the solid bg-background, darkened to ~27% while hovered.
    const alpha = hovered ? '45' : '25'
    customStyle.backgroundImage = `linear-gradient(${refColor}${alpha}, ${refColor}${alpha})`
    customStyle.borderColor = `${refColor}50` // ~30% opacity
    customStyle.color = refColor
    if (isRemote) {
      customStyle.borderStyle = 'dashed'
      badgeClasses = cn(badgeClasses, 'opacity-80')
    } else if (isStash) {
      customStyle.borderStyle = 'dashed'
      badgeClasses = cn(badgeClasses, 'opacity-90')
    }
  }

  // Tags are always visible with high opacity
  if (isTag) {
    badgeClasses = cn(badgeClasses, 'opacity-90')
  }

  const renderBadge = (overlay: boolean) => (
    <span
      ref={overlay ? undefined : badgeRef}
      // Inline: bounded width + truncation. Overlay: no bound → the whole text fits. The overlay is
      // pinned (fixed) over the inline badge and lets the mouse through (pointer-events-none) so the
      // underlying badge's `onMouseLeave` closes it.
      className={cn(
        badgeClasses,
        overlay ? 'pointer-events-none fixed z-overlay' : expand ? 'w-full' : 'max-w-[180px]',
        !overlay && canDragDrop && 'cursor-grab select-auto active:cursor-grabbing',
        // WKWebView (Tauri) refuses to start a native drag on an element inside a `user-select:none`
        // subtree — which the whole graph is — unless the drag is re-enabled here: `select-auto`
        // lifts the inherited `user-select:none` and `-webkit-user-drag:element` turns the badge
        // itself into a draggable object. Only while armed (left button held) — see `dragArmed`.
        !overlay && canDragDrop && dragArmed && '[-webkit-user-drag:element]',
        // Drop highlight — also on the portaled overlay (which isn't clipped by the ref group's
        // overflow-hidden), so short-named branch targets get visible feedback too.
        isDropTarget && 'ring-2 ring-emerald-400 ring-offset-1 ring-offset-background'
      )}
      style={
        overlay && overlayPos
          ? { ...customStyle, top: overlayPos.top, left: overlayPos.left }
          : customStyle
      }
      data-testid={overlay ? undefined : `ref-label-${gitRef.type}-${gitRef.shortName}`}
      data-ref-tag={overlay ? undefined : tagRefAttr}
      onMouseEnter={
        overlay
          ? undefined
          : () => {
              setHovered(true)
              showOverlay()
            }
      }
      onMouseLeave={
        overlay
          ? undefined
          : () => {
              setHovered(false)
              hideOverlay()
            }
      }
      onMouseDown={
        !overlay && canDragDrop
          ? (e) => {
              if (e.button === 0) setDragArmed(true)
            }
          : undefined
      }
      draggable={!overlay && canDragDrop && dragArmed ? true : undefined}
      onDragStart={!overlay && canDragDrop ? handleDragStart : undefined}
      onDragEnd={!overlay && canDragDrop ? handleDragEnd : undefined}
      onDragOver={!overlay && canDragDrop ? handleDragOver : undefined}
      onDragEnter={!overlay && canDragDrop ? handleDragEnter : undefined}
      onDrop={!overlay && canDragDrop ? handleDrop : undefined}
    >
      {isHEAD && <GitCommitHorizontal className="h-3 w-3 shrink-0" />}
      {!isHEAD && !isRemote && !isTag && !isStash && <Check className="h-3 w-3 shrink-0" />}
      {isTag && <Tag className="h-3 w-3 shrink-0" />}
      {isStash && <Archive className="h-3 w-3 shrink-0" />}

      <span ref={overlay ? undefined : nameRef} className={overlay ? undefined : 'truncate'}>
        {label}
      </span>

      {isRemote && <GithubMark className="ml-0.5 h-3 w-3" />}
      {!isHEAD && !isRemote && !isTag && !isStash && <Laptop className="ml-0.5 h-3 w-3 shrink-0" />}
    </span>
  )

  return (
    <>
      {renderBadge(false)}
      {overlayPos && createPortal(renderBadge(true), document.body)}
    </>
  )
}
