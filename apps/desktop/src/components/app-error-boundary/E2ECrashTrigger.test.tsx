import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppErrorBoundary } from './AppErrorBoundary'
import { E2ECrashTrigger } from './E2ECrashTrigger'
import { useE2eCrashStore } from '../../stores/e2eCrash.store'

beforeEach(() => {
  useE2eCrashStore.setState({ shouldCrash: false })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('E2ECrashTrigger', () => {
  it('renders nothing when the flag is off', () => {
    render(
      <AppErrorBoundary>
        <E2ECrashTrigger />
        <div data-testid="healthy-child">fine</div>
      </AppErrorBoundary>
    )
    expect(screen.getByTestId('healthy-child')).toBeInTheDocument()
    expect(screen.queryByTestId('app-error-boundary')).toBeNull()
  })

  it('throws once the store flag is set, and AppErrorBoundary catches it', () => {
    useE2eCrashStore.getState().trigger()
    render(
      <AppErrorBoundary>
        <E2ECrashTrigger />
        <div data-testid="healthy-child">fine</div>
      </AppErrorBoundary>
    )
    expect(screen.getByTestId('app-error-boundary')).toBeInTheDocument()
    expect(screen.queryByTestId('healthy-child')).toBeNull()
  })
})
