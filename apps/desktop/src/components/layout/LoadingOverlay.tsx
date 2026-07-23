import { useEffect, useState } from 'react'
import { cn } from '@git-manager/ui'
import { OctopusMascot } from '@git-manager/mascot'
import {
  useGlobalLoadingStore,
  selectIsGlobalLoading,
  selectGlobalLoadingLabel,
} from '../../stores/globalLoading.store'

/** How long the fade lasts; the node is kept mounted a touch longer so the fade-out completes. */
const FADE_MS = 220

/**
 * Full-screen loading overlay: a semi-transparent black scrim with the animated mascot bobbing at
 * its center, shown whenever a global loading operation is in flight (see {@link useGlobalLoadingWhile})
 * — most notably while a repo (or the Launchpad) loads its data. Sits just under the startup splash's
 * z-index so the splash cleanly covers it during launch.
 *
 * The overlay fades in and out rather than popping: it stays mounted through the exit transition and
 * keeps its last caption while fading, so the disappearance isn't abrupt.
 */
export function LoadingOverlay() {
  const isLoading = useGlobalLoadingStore(selectIsGlobalLoading)
  const label = useGlobalLoadingStore(selectGlobalLoadingLabel)

  // `mounted` keeps the node in the DOM through the exit fade; `visible` drives the opacity.
  const [mounted, setMounted] = useState(isLoading)
  const [visible, setVisible] = useState(isLoading)
  // Hold the last non-empty caption so the text doesn't vanish before the scrim finishes fading.
  const [shownLabel, setShownLabel] = useState(label)

  useEffect(() => {
    if (isLoading) {
      setShownLabel(label)
      setMounted(true)
      // Flip to visible on the next frame so a freshly-mounted node transitions from opacity-0.
      const raf = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(raf)
    }
    setVisible(false)
    const timer = setTimeout(() => setMounted(false), FADE_MS)
    return () => clearTimeout(timer)
  }, [isLoading, label])

  if (!mounted) return null

  return (
    <div
      data-testid="loading-overlay"
      role="status"
      aria-live="polite"
      className={cn(
        'fixed inset-0 z-[9998] flex flex-col items-center justify-center gap-4 bg-black/60 backdrop-blur-sm transition-opacity ease-out',
        visible ? 'opacity-100' : 'opacity-0'
      )}
      style={{ transitionDuration: `${FADE_MS}ms` }}
    >
      <OctopusMascot size={260} animated eyeTracking label={shownLabel || undefined} />
      {shownLabel && <span className="text-sm font-medium text-white/90">{shownLabel}</span>}
    </div>
  )
}
