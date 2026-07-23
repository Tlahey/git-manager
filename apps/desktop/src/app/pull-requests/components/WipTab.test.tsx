import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { LocalWipRepo } from '../../../hooks/useLocalWipRepos'

const { useLocalWipRepos } = vi.hoisted(() => ({ useLocalWipRepos: vi.fn() }))
vi.mock('../../../hooks/useLocalWipRepos', () => ({ useLocalWipRepos }))

import { WipTab } from './WipTab'
import { useRepoUIStore } from '../../../stores/repoUI.store'

function repo(overrides: Partial<LocalWipRepo> = {}): LocalWipRepo {
  return {
    path: '/repo',
    name: 'repo',
    head: 'main',
    totalChanges: 3,
    added: 1,
    modified: 1,
    deleted: 1,
    conflicted: 0,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useRepoUIStore.setState({ openTabs: [], activeTab: 'pull-requests', activeRepo: null })
})

describe('WipTab', () => {
  it('shows an empty state when nothing is dirty', () => {
    useLocalWipRepos.mockReturnValue({ wipRepos: [], loading: false })
    render(<WipTab />)
    expect(screen.getByText('No uncommitted work')).toBeInTheDocument()
  })

  it('lists dirty repos with their change breakdown', () => {
    useLocalWipRepos.mockReturnValue({
      wipRepos: [repo({ path: '/a', name: 'alpha', added: 2, modified: 3, deleted: 4 })],
      loading: false,
    })
    render(<WipTab />)
    expect(screen.getByText('alpha')).toBeInTheDocument()
    expect(screen.getByText('+2')).toBeInTheDocument()
    expect(screen.getByText('~3')).toBeInTheDocument()
    // Match either the minus sign (U+2212) or a hyphen so the glyph choice can't break the test.
    expect(screen.getByText(/^[−-]4$/)).toBeInTheDocument()
  })

  it('shows a conflicts badge when there are conflicts', () => {
    useLocalWipRepos.mockReturnValue({
      wipRepos: [repo({ conflicted: 2 })],
      loading: false,
    })
    render(<WipTab />)
    expect(screen.getByText('2 conflicts')).toBeInTheDocument()
  })

  it('opens the repo tab when the open button is clicked', async () => {
    useLocalWipRepos.mockReturnValue({
      wipRepos: [repo({ path: '/repo-x', name: 'repo-x' })],
      loading: false,
    })
    const user = userEvent.setup()
    render(<WipTab />)
    await user.click(screen.getByTestId('wip-open-/repo-x'))
    expect(useRepoUIStore.getState().activeTab).toBe('/repo-x')
    expect(useRepoUIStore.getState().openTabs).toContain('/repo-x')
  })
})
