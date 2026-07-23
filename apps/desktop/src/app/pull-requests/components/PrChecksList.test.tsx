import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import type { CiDetail } from '../types'

const { pluginOpen } = vi.hoisted(() => ({ pluginOpen: vi.fn() }))
vi.mock('@tauri-apps/plugin-shell', () => ({ open: pluginOpen }))

import { PrChecksList } from './PrChecksList'

beforeEach(() => {
  vi.clearAllMocks()
  pluginOpen.mockResolvedValue(undefined)
})

describe('PrChecksList', () => {
  it('shows an empty-state message when there are no checks', () => {
    render(<PrChecksList details={[]} />)
    expect(screen.getByText('No CI checks reported')).toBeInTheDocument()
    expect(screen.queryByTestId('pr-checks-list')).not.toBeInTheDocument()
  })

  it('renders one row per check with its name and status', () => {
    const details: CiDetail[] = [
      { name: 'build', status: 'success', url: 'https://ci/build' },
      { name: 'e2e', status: 'running', url: 'https://ci/e2e' },
    ]
    render(<PrChecksList details={details} />)
    expect(screen.getByText('build')).toBeInTheDocument()
    expect(screen.getByText('e2e')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /build/ })).toBeInTheDocument()
  })

  it('opens the check run on GitHub when a linked check is clicked', async () => {
    render(
      <PrChecksList details={[{ name: 'build', status: 'success', url: 'https://ci/build' }]} />
    )
    await act(async () => {
      fireEvent.click(screen.getByText('build'))
      await Promise.resolve()
    })
    expect(pluginOpen).toHaveBeenCalledWith('https://ci/build')
  })

  it('renders a check without a URL as non-interactive', () => {
    render(<PrChecksList details={[{ name: 'legacy', status: 'unknown' }]} />)
    expect(screen.getByText('legacy')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
