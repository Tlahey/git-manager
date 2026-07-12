import { useCallback, useState, type RefObject } from 'react'
import { GAP_WIDTH, MIN_PANE_PX } from '../../mergeViewConfig'

function initialWidths(isTwoWay: boolean): [number, number, number] {
  return isTwoWay ? [50, 50, 0] : [33.333, 33.334, 33.333]
}

/** Pane-width state plus the two gap-handle drag interactions. Dragging a handle redistributes
 * width between the two panes it separates (as flex-grow percentages of the container minus the
 * fixed connector gaps), clamped so neither pane collapses below MIN_PANE_PX. Mousedowns on the
 * connector accept/ignore buttons (which live inside the same gap) are ignored so clicking them
 * doesn't start a drag. */
export function usePanelResize(containerRef: RefObject<HTMLDivElement | null>, isTwoWay: boolean) {
  const [panelWidths, setPanelWidths] = useState<[number, number, number]>(() =>
    initialWidths(isTwoWay)
  )

  const resetPanelWidths = useCallback(() => {
    setPanelWidths(initialWidths(isTwoWay))
  }, [isTwoWay])

  const handleLeftMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('.merge-connector-action')) {
        return
      }
      e.preventDefault()

      const startX = e.clientX
      const startLeftPct = panelWidths[0]
      const startCenterPct = panelWidths[1]
      const containerWidth = containerRef.current?.getBoundingClientRect().width ?? 0
      const panelsWidth = containerWidth - (isTwoWay ? GAP_WIDTH : GAP_WIDTH * 2)

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const dx = moveEvent.clientX - startX
        const dPct = (dx / panelsWidth) * 100

        let newLeft = startLeftPct + dPct
        let newCenter = startCenterPct - dPct
        const sum = startLeftPct + startCenterPct
        const minPct = Math.min(33.3, (MIN_PANE_PX / panelsWidth) * 100)

        if (newLeft < minPct) {
          newLeft = minPct
          newCenter = sum - minPct
        } else if (newCenter < minPct) {
          newCenter = minPct
          newLeft = sum - minPct
        }

        setPanelWidths((prev) => [newLeft, newCenter, prev[2]])
      }

      const handleMouseUp = () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }

      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    },
    [panelWidths, containerRef, isTwoWay]
  )

  const handleRightMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('.merge-connector-action')) {
        return
      }
      e.preventDefault()

      const startX = e.clientX
      const startCenterPct = panelWidths[1]
      const startRightPct = panelWidths[2]
      const containerWidth = containerRef.current?.getBoundingClientRect().width ?? 0
      const panelsWidth = containerWidth - GAP_WIDTH * 2

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const dx = moveEvent.clientX - startX
        const dPct = (dx / panelsWidth) * 100

        let newCenter = startCenterPct + dPct
        let newRight = startRightPct - dPct
        const sum = startCenterPct + startRightPct
        const minPct = Math.min(33.3, (MIN_PANE_PX / panelsWidth) * 100)

        if (newCenter < minPct) {
          newCenter = minPct
          newRight = sum - minPct
        } else if (newRight < minPct) {
          newRight = minPct
          newCenter = sum - minPct
        }

        setPanelWidths((prev) => [prev[0], newCenter, newRight])
      }

      const handleMouseUp = () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }

      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    },
    [panelWidths, containerRef]
  )

  return { panelWidths, resetPanelWidths, handleLeftMouseDown, handleRightMouseDown }
}
