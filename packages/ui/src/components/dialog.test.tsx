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
