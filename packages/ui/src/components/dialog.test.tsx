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
})
