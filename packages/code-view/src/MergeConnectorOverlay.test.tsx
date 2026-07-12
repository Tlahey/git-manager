import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  MergeConnectorOverlay,
  buildCollapsedWavePath,
  type ConnectorSegment,
} from './MergeConnectorOverlay'

function segment(
  overrides: Partial<ConnectorSegment> & Pick<ConnectorSegment, 'id'>
): ConnectorSegment {
  return {
    leftY0: 0,
    leftY1: 18,
    rightY0: 0,
    rightY1: 18,
    colorClass: 'merge-connector-change',
    actionable: true,
    ...overrides,
  }
}

describe('MergeConnectorOverlay', () => {
  it('draws one ribbon path per segment, always — even settled (non-actionable) ones', () => {
    const segments = [segment({ id: 1, actionable: true }), segment({ id: 2, actionable: false })]
    const { container } = render(
      <MergeConnectorOverlay
        width={40}
        height={200}
        segments={segments}
        side="left"
        onAccept={vi.fn()}
        onReject={vi.fn()}
      />
    )
    expect(container.querySelectorAll('svg path')).toHaveLength(2)
  })

  it('only renders accept/ignore buttons for segments whose side is still actionable', () => {
    const segments = [segment({ id: 1, actionable: true }), segment({ id: 2, actionable: false })]
    render(
      <MergeConnectorOverlay
        width={40}
        height={200}
        segments={segments}
        side="left"
        onAccept={vi.fn()}
        onReject={vi.fn()}
      />
    )
    expect(screen.getAllByRole('button')).toHaveLength(2) // one accept + one reject, for segment 1 only
  })

  it('orders left-gap buttons as [accept, ignore] — accept hugs the source (left/theirs) pane edge', () => {
    render(
      <MergeConnectorOverlay
        width={40}
        height={200}
        segments={[segment({ id: 1 })]}
        side="left"
        onAccept={vi.fn()}
        onReject={vi.fn()}
      />
    )
    const buttons = screen.getAllByRole('button')
    expect(buttons[0]).toHaveAccessibleName('Accept incoming change')
    expect(buttons[1]).toHaveAccessibleName('Ignore this change')
  })

  it('orders right-gap buttons as [ignore, accept] — accept hugs the source (right/ours) pane edge', () => {
    render(
      <MergeConnectorOverlay
        width={40}
        height={200}
        segments={[segment({ id: 1 })]}
        side="right"
        onAccept={vi.fn()}
        onReject={vi.fn()}
      />
    )
    const buttons = screen.getAllByRole('button')
    expect(buttons[0]).toHaveAccessibleName('Ignore this change')
    expect(buttons[1]).toHaveAccessibleName('Accept current change')
  })

  it('calls onAccept with the segment’s block id when the accept button is clicked', async () => {
    const onAccept = vi.fn()
    const user = userEvent.setup()
    render(
      <MergeConnectorOverlay
        width={40}
        height={200}
        segments={[segment({ id: 42 })]}
        side="left"
        onAccept={onAccept}
        onReject={vi.fn()}
      />
    )
    await user.click(screen.getByRole('button', { name: 'Accept incoming change' }))
    expect(onAccept).toHaveBeenCalledTimes(1)
    expect(onAccept).toHaveBeenCalledWith(42)
  })

  it('calls onReject with the segment’s block id when the ignore button is clicked', async () => {
    const onReject = vi.fn()
    const user = userEvent.setup()
    render(
      <MergeConnectorOverlay
        width={40}
        height={200}
        segments={[segment({ id: 7 })]}
        side="right"
        onAccept={vi.fn()}
        onReject={onReject}
      />
    )
    await user.click(screen.getByRole('button', { name: 'Ignore this change' }))
    expect(onReject).toHaveBeenCalledTimes(1)
    expect(onReject).toHaveBeenCalledWith(7)
  })

  it('anchors the buttons at the connector’s start: level with the block’s top on the source pane’s end', () => {
    // The source pane of the left gap is the left one: its block spans 100→136, the center end
    // pinches at 90 — the buttons must sit at the source block's own top (100), WebStorm-style,
    // not at the ribbon's vertical center or the pinched tip.
    render(
      <MergeConnectorOverlay
        width={40}
        height={200}
        segments={[segment({ id: 1, leftY0: 100, leftY1: 136, rightY0: 90, rightY1: 90 })]}
        side="left"
        onAccept={vi.fn()}
        onReject={vi.fn()}
      />
    )
    const container = screen.getByRole('button', { name: 'Accept incoming change' }).parentElement
    expect(container).toHaveStyle({ top: '100px' })
  })

  it('anchors right-gap buttons on the right pane’s end of the segment', () => {
    render(
      <MergeConnectorOverlay
        width={40}
        height={200}
        segments={[segment({ id: 1, leftY0: 90, leftY1: 90, rightY0: 100, rightY1: 136 })]}
        side="right"
        onAccept={vi.fn()}
        onReject={vi.fn()}
      />
    )
    const container = screen.getByRole('button', { name: 'Accept current change' }).parentElement
    expect(container).toHaveStyle({ top: '100px' })
  })

  it('renders a flat segment as an open stroked line, never with buttons', () => {
    const { container } = render(
      <MergeConnectorOverlay
        width={40}
        height={200}
        segments={[
          segment({
            id: 1,
            leftY0: 50,
            leftY1: 50,
            rightY0: 60,
            rightY1: 60,
            flat: true,
            actionable: false,
          }),
        ]}
        side="left"
        onAccept={vi.fn()}
        onReject={vi.fn()}
      />
    )
    const path = container.querySelector('svg path')
    expect(path).toHaveClass('merge-connector-flat')
    expect(path?.getAttribute('d')).not.toContain('Z') // open stroke, not a closed filled shape
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('renders no buttons at all when every segment is already settled', () => {
    render(
      <MergeConnectorOverlay
        width={40}
        height={200}
        segments={[segment({ id: 1, actionable: false }), segment({ id: 2, actionable: false })]}
        side="left"
        onAccept={vi.fn()}
        onReject={vi.fn()}
      />
    )
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('renders a collapsed segment as a sloped fill+wave ribbon, not a div', () => {
    const segments = [
      segment({
        id: 1,
        colorClass: 'merge-connector-collapsed',
        leftY0: 38,
        leftY1: 85.5,
        rightY0: 50,
        rightY1: 97.5,
      }),
      segment({ id: 2, colorClass: 'merge-connector-conflict', leftY0: 142.5, leftY1: 161.5 }),
    ]
    const { container } = render(
      <MergeConnectorOverlay
        width={40}
        height={200}
        segments={segments}
        side="left"
        onAccept={vi.fn()}
        onReject={vi.fn()}
      />
    )
    expect(container.querySelectorAll('.monaco-collapsed-zone-banner')).toHaveLength(0)

    const group = container.querySelector('g[data-collapsed-block-id="1"]')
    expect(group).not.toBeNull()
    expect(group?.querySelectorAll('path.merge-connector-collapsed-fill')).toHaveLength(1)
    expect(group?.querySelectorAll('path.merge-connector-collapsed-wave')).toHaveLength(1)

    // The left pane's block sits at 38→85.5, the right pane's at 50→97.5 — the ribbon must
    // slope between the two rather than assuming a collapsed region lines up across panes.
    const [fillPath, wavePath] = group?.querySelectorAll('path') ?? []
    expect(fillPath.getAttribute('d')).toBe(
      'M 0,38 C 20,38 20,50 40,50 L 40,97.5 C 20,97.5 20,85.5 0,85.5 Z'
    )
    // Threads through the vertical midpoint of each side (38+85.5)/2=61.75, (50+97.5)/2=73.75 —
    // not the plain straight line a fill/border curve would draw between those points.
    expect(wavePath.getAttribute('d')).toBe(buildCollapsedWavePath(61.75, 73.75, 40))
    expect(wavePath.getAttribute('d')).not.toBe(`M 0,61.75 L 40,73.75`)
  })

  it('buildCollapsedWavePath offsets its own start/end points when phaseOffset lands mid-arc', () => {
    // phaseOffset=225 -> localStart=5, exactly the arc's own midpoint (its peak/trough) — the
    // worst case for the bug where the path's start and end were hard-coded onto the flat
    // baseline regardless of phase, instead of the arc's actual value there. That silently broke
    // continuity with the adjacent pane's own CSS-mask wave, which (unlike this path) is a truly
    // continuous tiled pattern with no "reset to baseline" at arbitrary points. width=40 is a
    // whole number of wave periods, so the end point lands on the same phase as the start.
    const d = buildCollapsedWavePath(100, 100, 40, 225)
    expect(d).toBe(
      'M 0,97.50 Q 2.50,97.50 5.00,100.00 Q 10.00,105.00 15.00,100.00 Q 20.00,95.00 25.00,100.00 Q 30.00,105.00 35.00,100.00 Q 37.50,97.50 40.00,97.50'
    )
  })

  it('calls onExpandBlock with the segment id when the collapsed ribbon is clicked', async () => {
    const onExpandBlock = vi.fn()
    const user = userEvent.setup()
    const segments = [segment({ id: 9, colorClass: 'merge-connector-collapsed' })]
    const { container } = render(
      <MergeConnectorOverlay
        width={40}
        height={200}
        segments={segments}
        side="left"
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onExpandBlock={onExpandBlock}
      />
    )
    await user.click(container.querySelector('path.merge-connector-collapsed-fill')!)
    expect(onExpandBlock).toHaveBeenCalledWith(9)
  })

  it('hovering a collapsed ribbon highlights every element sharing its data-collapsed-block-id, not just itself', async () => {
    const user = userEvent.setup()
    const segments = [segment({ id: 5, colorClass: 'merge-connector-collapsed' })]
    const { container } = render(
      <MergeConnectorOverlay
        width={40}
        height={200}
        segments={segments}
        side="left"
        onAccept={vi.fn()}
        onReject={vi.fn()}
      />
    )
    // Stands in for a pane's own in-editor banner: a separate element elsewhere in the document
    // that shares the block id and relies on the same document-wide hover sync as the ribbon.
    const paneBanner = document.createElement('div')
    paneBanner.setAttribute('data-collapsed-block-id', '5')
    document.body.appendChild(paneBanner)

    const group = container.querySelector('g[data-collapsed-block-id="5"]')!
    await user.hover(group)
    expect(group).toHaveClass('is-hovered')
    expect(paneBanner).toHaveClass('is-hovered')

    await user.unhover(group)
    expect(group).not.toHaveClass('is-hovered')
    expect(paneBanner).not.toHaveClass('is-hovered')

    document.body.removeChild(paneBanner)
  })
})
