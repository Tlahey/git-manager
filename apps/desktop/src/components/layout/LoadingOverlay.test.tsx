import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { LoadingOverlay } from './LoadingOverlay'
import { useGlobalLoadingStore } from '../../stores/globalLoading.store'

vi.mock('@git-manager/mascot', () => ({
  OctopusMascot: () => <div data-testid="octopus-mascot" />,
}))

describe('LoadingOverlay', () => {
  beforeEach(() => {
    useGlobalLoadingStore.setState({ active: {} })
  })

  it('renders nothing while idle', () => {
    const { container } = render(<LoadingOverlay />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the mascot and caption while a loading operation is active', () => {
    useGlobalLoadingStore.getState().begin('Loading history...')
    render(<LoadingOverlay />)

    expect(screen.getByTestId('loading-overlay')).toBeInTheDocument()
    expect(screen.getByTestId('octopus-mascot')).toBeInTheDocument()
    expect(screen.getByText('Loading history...')).toBeInTheDocument()
  })

  it('exposes the overlay as an assertive-free polite status region', () => {
    useGlobalLoadingStore.getState().begin('Loading...')
    render(<LoadingOverlay />)

    const overlay = screen.getByTestId('loading-overlay')
    expect(overlay).toHaveAttribute('role', 'status')
    expect(overlay).toHaveAttribute('aria-live', 'polite')
  })

  it('fades out — stays briefly (transparent, caption kept) then unmounts after loading ends', async () => {
    const token = useGlobalLoadingStore.getState().begin('Loading...')
    render(<LoadingOverlay />)
    expect(screen.getByTestId('loading-overlay')).toHaveClass('opacity-100')

    act(() => useGlobalLoadingStore.getState().end(token))

    // Still mounted immediately after — now fading (opacity-0) with its caption retained.
    const overlay = screen.getByTestId('loading-overlay')
    expect(overlay).toHaveClass('opacity-0')
    expect(screen.getByText('Loading...')).toBeInTheDocument()

    await waitFor(() =>
      expect(screen.queryByTestId('loading-overlay')).not.toBeInTheDocument()
    )
  })
})
