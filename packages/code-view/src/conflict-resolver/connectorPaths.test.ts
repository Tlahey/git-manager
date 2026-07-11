import { describe, expect, it } from 'vitest'
import type { ConnectorSegment } from '../MergeConnectorOverlay'
import { GAP_WIDTH } from '../mergeViewConfig'
import { updateConnectorPaths } from './connectorPaths'

function segment(overrides: Partial<ConnectorSegment>): ConnectorSegment {
  return {
    id: 1,
    leftY0: 100,
    leftY1: 120,
    rightY0: 100,
    rightY1: 120,
    colorClass: 'merge-connector-conflict',
    actionable: false,
    flat: false,
    resolved: false,
    ...overrides,
  }
}

/** Overlay stub with the same document-order path/button structure the real
 * MergeConnectorOverlay renders for the given segments. */
function overlayFor(segments: ConnectorSegment[]): HTMLDivElement {
  const overlay = document.createElement('div')
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  overlay.appendChild(svg)
  for (const seg of segments) {
    const pathCount = seg.colorClass === 'merge-connector-collapsed' ? 2 : seg.resolved && !seg.flat ? 2 : 1
    for (let i = 0; i < pathCount; i++) {
      svg.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'path'))
    }
    if (seg.actionable) {
      const btn = document.createElement('div')
      btn.className = 'merge-connector-action-container'
      overlay.appendChild(btn)
    }
  }
  return overlay
}

describe('updateConnectorPaths', () => {
  it('rewrites a plain ribbon path in viewport space (content Y minus each pane’s scrollTop)', () => {
    const seg = segment({})
    const overlay = overlayFor([seg])

    updateConnectorPaths(overlay, 30, 10, [seg], 'left', 0)

    const d = overlay.querySelector('path')!.getAttribute('d')!
    // left ys shift by 30, right ys by 10.
    expect(d).toBe(`M 0,70 C ${GAP_WIDTH / 2},70 ${GAP_WIDTH / 2},90 ${GAP_WIDTH},90 L ${GAP_WIDTH},110 C ${GAP_WIDTH / 2},110 ${GAP_WIDTH / 2},90 0,90 Z`)
  })

  it('renders a flat segment as a single thin stroke path', () => {
    const seg = segment({ flat: true })
    const overlay = overlayFor([seg])

    updateConnectorPaths(overlay, 0, 0, [seg], 'left', 0)

    const d = overlay.querySelector('path')!.getAttribute('d')!
    expect(d).toBe(`M 0,100 C ${GAP_WIDTH / 2},100 ${GAP_WIDTH / 2},100 ${GAP_WIDTH},100`)
    expect(d).not.toContain('Z')
  })

  it('renders a resolved segment as two edge strokes nudged 1px inward', () => {
    const seg = segment({ resolved: true })
    const overlay = overlayFor([seg])

    updateConnectorPaths(overlay, 0, 0, [seg], 'left', 0)

    const paths = overlay.querySelectorAll('path')
    expect(paths[0].getAttribute('d')).toContain('M 0,101 ')
    expect(paths[1].getAttribute('d')).toContain('M 0,119 ')
  })

  it('emits fill-then-wave paths for a collapsed segment, in document order', () => {
    const seg = segment({ colorClass: 'merge-connector-collapsed', collapsedCount: 4 })
    const overlay = overlayFor([seg])

    updateConnectorPaths(overlay, 0, 0, [seg], 'left', 0)

    const paths = overlay.querySelectorAll('path')
    expect(paths[0].getAttribute('d')).toContain('Z') // closed quadrilateral hit-target
    expect(paths[1].getAttribute('d')).not.toContain('Z') // open wave stroke
  })

  it('repositions actionable segments’ button containers at the authoring pane’s edge', () => {
    const seg = segment({ actionable: true })
    const overlay = overlayFor([seg])

    updateConnectorPaths(overlay, 40, 15, [seg], 'left', 0)
    expect((overlay.querySelector('.merge-connector-action-container') as HTMLDivElement).style.top).toBe('60px')

    updateConnectorPaths(overlay, 40, 15, [seg], 'right', 0)
    expect((overlay.querySelector('.merge-connector-action-container') as HTMLDivElement).style.top).toBe('85px')
  })

  it('is a no-op for a null overlay element', () => {
    expect(() => updateConnectorPaths(null, 0, 0, [segment({})], 'left', 0)).not.toThrow()
  })
})
