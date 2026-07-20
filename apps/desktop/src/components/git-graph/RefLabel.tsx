import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { GitRef } from '@git-manager/git-types'
import { cn } from '@git-manager/ui'
import { GitCommitHorizontal, Check, Laptop, Tag, Archive } from 'lucide-react'
import { useRefDragStore, isValidRefDropTarget, isSameRef } from '../../stores/refDrag.store'
import { useRefDropHandler } from './RefDropContext'

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
}

function GithubIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <title>GitHub</title>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  )
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

export function RefLabel({ gitRef, color, interactive = true }: RefLabelProps) {
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
    customStyle.backgroundImage =
      'linear-gradient(rgba(16, 185, 129, 0.2), rgba(16, 185, 129, 0.2))'
  } else {
    customStyle.backgroundImage = `linear-gradient(${refColor}25, ${refColor}25)` // ~15% opacity overlay over solid bg-background
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
        overlay ? 'pointer-events-none fixed z-overlay' : 'max-w-[180px]',
        // WKWebView (Tauri) refuses to start a native drag on an element inside a `user-select:none`
        // subtree — which the whole graph is — unless the drag is re-enabled here: `select-auto`
        // lifts the inherited `user-select:none` and `-webkit-user-drag:element` turns the badge
        // itself into a draggable object.
        !overlay && canDragDrop && 'cursor-grab select-auto active:cursor-grabbing [-webkit-user-drag:element]',
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
      onMouseEnter={overlay ? undefined : () => showOverlay()}
      onMouseLeave={overlay ? undefined : hideOverlay}
      draggable={!overlay && canDragDrop ? true : undefined}
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

      {isRemote && <GithubIcon className="ml-0.5 h-3 w-3 shrink-0" />}
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
