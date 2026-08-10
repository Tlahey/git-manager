import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from './dialog'

function ExampleDialog() {
  return (
    <Dialog>
      <DialogTrigger>Open</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete file</DialogTitle>
          <DialogDescription>This cannot be undone.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button>Confirm</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

describe('Dialog', () => {
  it('is closed by default, with no dialog content in the document', () => {
    render(<ExampleDialog />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens on trigger click and renders its title/description', async () => {
    const user = userEvent.setup()
    render(<ExampleDialog />)
    await user.click(screen.getByText('Open'))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Delete file')).toBeInTheDocument()
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument()
  })

  it('closes when the built-in close button is clicked', async () => {
    const user = userEvent.setup()
    render(<ExampleDialog />)
    await user.click(screen.getByText('Open'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    render(<ExampleDialog />)
    await user.click(screen.getByText('Open'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('labels the dialog via DialogTitle for accessibility', async () => {
    const user = userEvent.setup()
    render(<ExampleDialog />)
    await user.click(screen.getByText('Open'))
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Delete file')
  })

  /**
   * The app has no native title bar, so the window is moved by grabbing a `data-tauri-drag-region`.
   * A modal's full-screen overlay covers it, which pinned the window for as long as a dialog was
   * open. `pointer-events-auto` matters: Radix sets `pointer-events: none` on `body` while a modal
   * is open and a portalled child would inherit it.
   */
  it('keeps a drag region above the overlay so the window can still be moved', async () => {
    const user = userEvent.setup()
    render(<ExampleDialog />)
    await user.click(screen.getByText('Open'))

    const strip = document.querySelector('[data-tauri-drag-region]')
    expect(strip).toBeInTheDocument()
    expect(strip).toHaveClass('pointer-events-auto')
    // Behind the content, so a panel's own close button in those top pixels stays clickable.
    expect(strip?.compareDocumentPosition(screen.getByRole('dialog'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    )
  })

  /**
   * The width belongs to the kind of content: a confirmation and a searchable list have no business
   * being the same size, which is what a single hardcoded `max-w` on every dialog produced.
   */
  describe('size', () => {
    function renderSized(props: Partial<React.ComponentProps<typeof DialogContent>> = {}) {
      render(
        <Dialog defaultOpen>
          <DialogContent {...props}>
            <DialogTitle>Sized</DialogTitle>
          </DialogContent>
        </Dialog>
      )
      return screen.getByRole('dialog')
    }

    /** Adding the prop must not have resized anything that didn't ask for it. */
    it('defaults to the width every dialog had before the prop existed', () => {
      expect(renderSized()).toHaveClass('max-w-lg')
    })

    it.each([
      ['sm', 'max-w-sm'],
      ['md', 'max-w-lg'],
      ['lg', 'max-w-2xl'],
      ['xl', 'max-w-4xl'],
    ] as const)('maps %s to %s', (size, expected) => {
      expect(renderSized({ size })).toHaveClass(expected)
    })

    /** `BoardCardDialog` sets an exact pixel width; the size step must not fight it. */
    it('lets a caller’s own max-width win', () => {
      const dialog = renderSized({ size: 'lg', className: 'max-w-[1100px]' })
      expect(dialog).toHaveClass('max-w-[1100px]')
      expect(dialog).not.toHaveClass('max-w-2xl')
    })

    it('ignores the size on a side panel, whose width is the viewport edge', () => {
      const panel = renderSized({ position: 'right', size: 'xl' })
      expect(panel).toHaveClass('max-w-none')
      expect(panel).not.toHaveClass('max-w-4xl')
    })
  })

  describe('showCloseButton', () => {
    it('renders the ✕ by default', () => {
      render(
        <Dialog defaultOpen>
          <DialogContent>
            <DialogTitle>Panel</DialogTitle>
          </DialogContent>
        </Dialog>
      )

      expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
    })

    /** For content that already fills the top-right corner — a side panel wrapping a screen with
     * its own toolbar there, where the ✕ would land on the toolbar's buttons. */
    it('can be suppressed when the content owns that corner', () => {
      render(
        <Dialog defaultOpen>
          <DialogContent position="right" showCloseButton={false}>
            <DialogTitle>Panel</DialogTitle>
          </DialogContent>
        </Dialog>
      )

      expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
    })

    /** Suppressing the ✕ removes a duplicate affordance, never the only way out. */
    it('still closes on Escape without the ✕', async () => {
      const user = userEvent.setup()
      render(
        <Dialog defaultOpen>
          <DialogContent position="right" showCloseButton={false}>
            <DialogTitle>Panel</DialogTitle>
          </DialogContent>
        </Dialog>
      )

      await user.keyboard('{Escape}')

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('renders a side panel flush right instead of centered', () => {
    render(
      <Dialog defaultOpen>
        <DialogContent position="right">
          <DialogTitle>Panel</DialogTitle>
        </DialogContent>
      </Dialog>
    )

    const panel = screen.getByRole('dialog')
    expect(panel).toHaveClass('inset-y-0', 'right-0')
    // None of the centering the default position applies.
    expect(panel.className).not.toMatch(/left-\[50%\]|translate-x-/)
  })
})
