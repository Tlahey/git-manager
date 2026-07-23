import { useEffect, useRef } from 'react'
import { attachTerminal, detachTerminal, fitTerminal, getOrCreateTerminal } from '../../lib/terminalRegistry'

interface XtermViewProps {
  /** Backend PTY session id — the xterm instance is owned by `lib/terminalRegistry`. */
  id: string
}

/**
 * Mounts a single terminal session's DOM node into the panel. The xterm.js instance itself lives in
 * the module registry (not React), so switching tabs or closing the panel only detaches the node —
 * scrollback and the live shell survive. A `ResizeObserver` keeps the PTY sized to the viewport.
 */
export function XtermView({ id }: XtermViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    getOrCreateTerminal(id)
    attachTerminal(id, container)
    const observer = new ResizeObserver(() => fitTerminal(id))
    observer.observe(container)
    return () => {
      observer.disconnect()
      detachTerminal(id)
    }
  }, [id])

  return <div ref={containerRef} className="h-full w-full" data-testid="xterm-view" />
}
