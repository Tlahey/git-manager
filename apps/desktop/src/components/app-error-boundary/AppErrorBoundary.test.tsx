import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppErrorBoundary } from './AppErrorBoundary'

function Bomb(): never {
  throw new Error('kaboom from render')
}

beforeEach(() => {
  // React logs the caught error itself on top of componentDidCatch's own line — both are
  // expected noise for these tests, not failures.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('AppErrorBoundary', () => {
  it('renders its children when nothing throws', () => {
    render(
      <AppErrorBoundary>
        <div data-testid="healthy-child">fine</div>
      </AppErrorBoundary>
    )
    expect(screen.getByTestId('healthy-child')).toBeInTheDocument()
    expect(screen.queryByTestId('app-error-boundary')).toBeNull()
  })

  it('replaces a crashed tree with the fallback instead of a blank page', () => {
    render(
      <AppErrorBoundary>
        <Bomb />
      </AppErrorBoundary>
    )
    expect(screen.getByTestId('app-error-boundary')).toBeInTheDocument()
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText('kaboom from render')).toBeInTheDocument()
  })

  it('offers a reload action that reloads the window', async () => {
    const reload = vi.fn()
    // jsdom marks location itself non-configurable, but the property object can be swapped.
    const original = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, reload },
    })

    render(
      <AppErrorBoundary>
        <Bomb />
      </AppErrorBoundary>
    )
    screen.getByText('Reload the app').click()
    expect(reload).toHaveBeenCalled()

    Object.defineProperty(window, 'location', { configurable: true, value: original })
  })
})
