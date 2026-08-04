import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

function currentValue(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(QUERY).matches
}

/**
 * Whether the user has asked their system to cut animation down.
 *
 * Read live rather than once at module load: the notch window is created per notification, but
 * Storybook and the app's own long-lived windows are not, and a setting toggled in System Settings
 * has to take effect without a restart.
 *
 * Guarded against a missing `matchMedia` because this package renders in three places — a Tauri
 * webview, a Storybook page and jsdom — and only two of them are browsers.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(currentValue)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const list = window.matchMedia(QUERY)
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches)
    setReduced(list.matches)
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }, [])

  return reduced
}
