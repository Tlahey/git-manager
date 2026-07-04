import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MergeConnectorOverlay, type ConnectorSegment } from './MergeConnectorOverlay'

function segment(overrides: Partial<ConnectorSegment> & Pick<ConnectorSegment, 'id'>): ConnectorSegment {
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
      <MergeConnectorOverlay width={40} height={200} segments={segments} side="left" onAccept={vi.fn()} onReject={vi.fn()} />
    )
    expect(container.querySelectorAll('svg path')).toHaveLength(2)
  })

  it('only renders accept/ignore buttons for segments whose side is still actionable', () => {
    const segments = [segment({ id: 1, actionable: true }), segment({ id: 2, actionable: false })]
    render(<MergeConnectorOverlay width={40} height={200} segments={segments} side="left" onAccept={vi.fn()} onReject={vi.fn()} />)
    expect(screen.getAllByRole('button')).toHaveLength(2) // one accept + one reject, for segment 1 only
  })

  it('orders left-gap buttons as [ignore, accept] — accept sits closer to the center pane', () => {
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
    expect(buttons[0]).toHaveAccessibleName('Ignore this change')
    expect(buttons[1]).toHaveAccessibleName('Accept current change')
  })

  it('orders right-gap buttons as [accept, ignore] — accept sits closer to the center pane', () => {
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
    expect(buttons[0]).toHaveAccessibleName('Accept incoming change')
    expect(buttons[1]).toHaveAccessibleName('Ignore this change')
  })

  it('calls onAccept with the segment’s block id when the accept button is clicked', async () => {
    const onAccept = vi.fn()
    const user = userEvent.setup()
    render(
      <MergeConnectorOverlay width={40} height={200} segments={[segment({ id: 42 })]} side="left" onAccept={onAccept} onReject={vi.fn()} />
    )
    await user.click(screen.getByRole('button', { name: 'Accept current change' }))
    expect(onAccept).toHaveBeenCalledTimes(1)
    expect(onAccept).toHaveBeenCalledWith(42)
  })

  it('calls onReject with the segment’s block id when the ignore button is clicked', async () => {
    const onReject = vi.fn()
    const user = userEvent.setup()
    render(
      <MergeConnectorOverlay width={40} height={200} segments={[segment({ id: 7 })]} side="right" onAccept={vi.fn()} onReject={onReject} />
    )
    await user.click(screen.getByRole('button', { name: 'Ignore this change' }))
    expect(onReject).toHaveBeenCalledTimes(1)
    expect(onReject).toHaveBeenCalledWith(7)
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
})
