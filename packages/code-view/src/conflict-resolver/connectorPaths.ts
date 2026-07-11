import { buildCollapsedWavePath, type ConnectorSegment } from '../MergeConnectorOverlay'
import { GAP_WIDTH } from '../mergeViewConfig'

/** Scroll-driven imperative repaint of one gap's connector overlay: rewrites every `<path d>`
 * (and repositions the action-button containers) in viewport space, bypassing React so the
 * ribbons track Monaco's own `onDidScrollChange` at the exact same synchronous moment instead
 * of catching up a render cycle later. The path-emission order per segment kind must mirror the
 * JSX `MergeConnectorOverlay` renders — fill-then-wave for collapsed, top-then-bottom strokes
 * for resolved — since paths are matched purely by document order. */
export function updateConnectorPaths(
  overlayElement: HTMLDivElement | null,
  scrollTopLeft: number,
  scrollTopRight: number,
  segments: ConnectorSegment[],
  side: 'left' | 'right',
  wavePhaseOffset: number
) {
  if (!overlayElement) return

  const half = GAP_WIDTH / 2
  const width = GAP_WIDTH

  // 1. Update SVG paths
  const paths = overlayElement.querySelectorAll('path')
  let pathIdx = 0

  segments.forEach((seg) => {
    const leftY0 = seg.leftY0 - scrollTopLeft
    const leftY1 = seg.leftY1 - scrollTopLeft
    const rightY0 = seg.rightY0 - scrollTopRight
    const rightY1 = seg.rightY1 - scrollTopRight

    if (seg.colorClass === 'merge-connector-collapsed') {
      // Mirrors the <g> the JSX renders: fill path (closed quadrilateral, invisible hit-target)
      // then the wave stroke — in that order.
      const d = [
        `M 0,${leftY0}`,
        `C ${half},${leftY0} ${half},${rightY0} ${width},${rightY0}`,
        `L ${width},${rightY1}`,
        `C ${half},${rightY1} ${half},${leftY1} 0,${leftY1}`,
        'Z',
      ].join(' ')
      const dWave = buildCollapsedWavePath((leftY0 + leftY1) / 2, (rightY0 + rightY1) / 2, width, wavePhaseOffset)

      const pathElFill = paths[pathIdx++] as SVGPathElement | undefined
      if (pathElFill) pathElFill.setAttribute('d', d)

      const pathElWave = paths[pathIdx++] as SVGPathElement | undefined
      if (pathElWave) pathElWave.setAttribute('d', dWave)
      return
    }

    if (seg.flat) {
      const d = `M 0,${leftY0} C ${half},${leftY0} ${half},${rightY0} ${width},${rightY0}`
      const pathEl = paths[pathIdx++] as SVGPathElement | undefined
      if (pathEl) pathEl.setAttribute('d', d)
    } else if (seg.resolved) {
      const dTop = `M 0,${leftY0 + 1} C ${half},${leftY0 + 1} ${half},${rightY0 + 1} ${width},${rightY0 + 1}`
      const dBottom = `M 0,${leftY1 - 1} C ${half},${leftY1 - 1} ${half},${rightY1 - 1} ${width},${rightY1 - 1}`

      const pathElTop = paths[pathIdx++] as SVGPathElement | undefined
      if (pathElTop) pathElTop.setAttribute('d', dTop)

      const pathElBottom = paths[pathIdx++] as SVGPathElement | undefined
      if (pathElBottom) pathElBottom.setAttribute('d', dBottom)
    } else {
      const d = [
        `M 0,${leftY0}`,
        `C ${half},${leftY0} ${half},${rightY0} ${width},${rightY0}`,
        `L ${width},${rightY1}`,
        `C ${half},${rightY1} ${half},${leftY1} 0,${leftY1}`,
        'Z',
      ].join(' ')

      const pathEl = paths[pathIdx++] as SVGPathElement | undefined
      if (pathEl) pathEl.setAttribute('d', d)
    }
  })

  // 2. Update action button positions
  const buttonContainers = overlayElement.querySelectorAll('.merge-connector-action-container')
  let btnIdx = 0

  segments.forEach((seg) => {
    if (!seg.actionable) return
    const anchorY = side === 'left' ? seg.leftY0 - scrollTopLeft : seg.rightY0 - scrollTopRight
    const btnContainer = buttonContainers[btnIdx++] as HTMLDivElement | undefined
    if (btnContainer) {
      btnContainer.style.top = `${anchorY}px`
    }
  })
}
