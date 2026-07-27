import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DialogTitle } from '@git-manager/ui'
import { SidePanelOverlay } from './SidePanelOverlay'

function open(props: Partial<React.ComponentProps<typeof SidePanelOverlay>> = {}) {
  return render(
    <SidePanelOverlay open onClose={vi.fn()} testIdPrefix="demo" {...props}>
      <DialogTitle>Demo panel</DialogTitle>
      <p>body</p>
    </SidePanelOverlay>
  )
}

describe('SidePanelOverlay', () => {
  it('renders nothing when closed', () => {
    render(
      <SidePanelOverlay open={false} onClose={vi.fn()} testIdPrefix="demo">
        <DialogTitle>Demo panel</DialogTitle>
      </SidePanelOverlay>
    )
    expect(screen.queryByTestId('demo-panel')).not.toBeInTheDocument()
  })

  it('renders its children and a resize handle when open', () => {
    open()
    expect(screen.getByTestId('demo-panel')).toBeInTheDocument()
    expect(screen.getByTestId('demo-resize')).toBeInTheDocument()
    expect(screen.getByText('body')).toBeInTheDocument()
  })

  /** The whole reason it is built on Dialog rather than a bespoke overlay: a hand-rolled
   * `absolute inset-0` div is not a dialog, has no accessible name, and leaves focus behind it. */
  it('is a named dialog that takes focus', () => {
    open()
    const panel = screen.getByRole('dialog')
    expect(panel).toHaveAccessibleName('Demo panel')
    expect(panel.contains(document.activeElement)).toBe(true)
  })

  it('closes on Escape', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    open({ onClose })

    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalled()
  })

  it('sizes itself from the viewport fraction it is given', () => {
    // jsdom's window.innerWidth is 1024 by default.
    open({ widthRatios: { initial: 0.5, min: 0.3, max: 0.9 } })
    expect(screen.getByTestId('demo-panel')).toHaveStyle({ width: '512px' })
  })
})
