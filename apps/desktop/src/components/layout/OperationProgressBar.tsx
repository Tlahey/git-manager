import { useOperationProgressStore } from '../../stores/operationProgress.store'

/**
 * Launchpad-style global progress strip (same shimmer as the pull-requests
 * page's refresh bar): a fixed-height 2px rail under the tab bar that animates
 * while any long-running backend operation (interactive rebase, …) is in
 * flight. Fixed height so appearing/disappearing causes no layout shift.
 */
export function OperationProgressBar() {
  const running = useOperationProgressStore((s) => s.running)
  const isActive = Object.keys(running).length > 0

  return (
    <div
      className="relative h-[2px] w-full shrink-0 overflow-hidden bg-sidebar"
      data-testid="operation-progress-bar"
    >
      {isActive && (
        <div className="animate-shimmer absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-primary to-transparent" />
      )}
    </div>
  )
}
