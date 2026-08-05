import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import type { Toaster as ToasterComponent } from './toast'
import type { toast as ToastFn } from './toast.store'

let toast: typeof ToastFn
let Toaster: typeof ToasterComponent

beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers()
  // Fresh module instance per test — the toast queue is a module-level singleton, so re-importing
  // after resetModules() gives each test its own isolated `toasts` array instead of leaking state.
  // Both halves must come from the SAME fresh registry: `toast.tsx` reads the queue out of
  // `toast.store.ts`, so importing them separately here still yields one shared instance.
  const view = await import('./toast')
  const store = await import('./toast.store')
  toast = store.toast
  Toaster = view.Toaster
})

afterEach(() => {
  vi.useRealTimers()
})

describe('toast store + Toaster', () => {
  it('renders nothing when there are no toasts', () => {
    const { container } = render(<Toaster />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a pushed toast with its message and description', async () => {
    render(<Toaster />)
    act(() => {
      toast.success('Saved', { description: 'Your changes were committed.' })
    })
    const card = screen.getByRole('status')
    expect(card).toBeInTheDocument()
    // The testid + variant attributes are a contract: the e2e suite's "no error notification is
    // displayed" step queries `[data-testid="toast"][data-variant="error"]`.
    expect(card).toHaveAttribute('data-testid', 'toast')
    expect(card).toHaveAttribute('data-variant', 'success')
    expect(screen.getByText('Saved')).toBeInTheDocument()
    expect(screen.getByText('Your changes were committed.')).toBeInTheDocument()
  })

  it('the default toast() call pushes an info-variant toast', () => {
    render(<Toaster />)
    act(() => {
      toast('Just FYI')
    })
    expect(screen.getByText('Just FYI')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveAttribute('data-variant', 'info')
  })

  it('stacks multiple toasts instead of replacing the previous one', () => {
    render(<Toaster />)
    act(() => {
      toast.info('First')
      toast.error('Second')
    })
    expect(screen.getAllByRole('status')).toHaveLength(2)
    expect(screen.getByText('First')).toBeInTheDocument()
    expect(screen.getByText('Second')).toBeInTheDocument()
  })

  it('auto-dismisses after the given duration', () => {
    render(<Toaster />)
    act(() => {
      toast.info('Ephemeral', { duration: 1000 })
    })
    expect(screen.getByText('Ephemeral')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    act(() => {
      vi.advanceTimersByTime(200) // EXIT_DURATION — clears it from the list after the leave transition
    })
    expect(screen.queryByText('Ephemeral')).not.toBeInTheDocument()
  })

  it('never auto-dismisses when duration is 0', () => {
    render(<Toaster />)
    act(() => {
      toast.info('Sticky', { duration: 0 })
    })
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(screen.getByText('Sticky')).toBeInTheDocument()
  })

  it('dismisses via the close button', () => {
    render(<Toaster />)
    act(() => {
      toast.info('Dismiss me')
    })
    const dismissButton = screen.getByRole('button', { name: 'Dismiss' })
    act(() => {
      dismissButton.click()
    })
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(screen.queryByText('Dismiss me')).not.toBeInTheDocument()
  })

  it('dismisses programmatically via toast.dismiss(id)', () => {
    render(<Toaster />)
    let id = ''
    act(() => {
      id = toast.warning('Careful')
    })
    expect(screen.getByText('Careful')).toBeInTheDocument()

    act(() => {
      toast.dismiss(id)
    })
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(screen.queryByText('Careful')).not.toBeInTheDocument()
  })

  it('is a no-op to dismiss an already-dismissing or unknown toast id', () => {
    render(<Toaster />)
    act(() => {
      toast.dismiss('does-not-exist')
    })
    // No crash, no toasts to show.
    expect(screen.queryAllByRole('status')).toHaveLength(0)
  })
})
