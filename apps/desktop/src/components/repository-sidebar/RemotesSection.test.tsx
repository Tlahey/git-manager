import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { GitBranch } from '@git-manager/git-types'

const { useBranches } = vi.hoisted(() => ({ useBranches: vi.fn() }))
vi.mock('../../hooks/useBranches', () => ({ useBranches }))
vi.mock('../../api/git.api', () => ({ apiRemoveRemote: vi.fn() }))
vi.mock('./HoverExpandLabel', () => ({ HoverExpandLabel: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }))

import { apiRemoveRemote } from '../../api/git.api'
import { RemotesSection } from './RemotesSection'

const mockedRemoveRemote = apiRemoveRemote as unknown as ReturnType<typeof vi.fn>

function remoteBranch(shortName: string, overrides: Partial<GitBranch> = {}): GitBranch {
  return {
    name: `refs/remotes/${shortName}`,
    shortName,
    isHead: false,
    isRemote: true,
    commitOid: '',
    commitMessage: '',
    commitTimestamp: 0,
    aheadCount: 0,
    behindCount: 0,
    ...overrides,
  }
}

function renderSection(props: Partial<React.ComponentProps<typeof RemotesSection>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
  const utils = render(
    <QueryClientProvider client={client}>
      <RemotesSection repoPath="/repo" selectedBranch={null} onSelectBranch={vi.fn()} {...props} />
    </QueryClientProvider>
  )
  return { ...utils, invalidateSpy }
}

beforeEach(() => {
  vi.clearAllMocks()
  useBranches.mockReturnValue({ data: [] })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.spyOn(window, 'alert').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('RemotesSection — visibility', () => {
  it('renders nothing when there are no remote branches', () => {
    useBranches.mockReturnValue({ data: [{ ...remoteBranch('x'), isRemote: false }] })
    const { container } = renderSection()
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the header with the remote-branch count', () => {
    // Both branches share the "origin" remote, so "2" legitimately appears twice: once as the
    // section's total count, once as that single group's own count badge.
    useBranches.mockReturnValue({ data: [remoteBranch('origin/main'), remoteBranch('origin/dev')] })
    renderSection()
    expect(screen.getByText('Remotes')).toBeInTheDocument()
    expect(screen.getAllByText('2')).toHaveLength(2)
  })

  it('filters remote branches by name', () => {
    useBranches.mockReturnValue({ data: [remoteBranch('origin/main'), remoteBranch('origin/feature-x')] })
    renderSection({ filter: 'feat' })
    expect(screen.getByText('feature-x')).toBeInTheDocument()
    expect(screen.queryByText('main')).not.toBeInTheDocument()
  })
})

describe('RemotesSection — grouping and display', () => {
  it('groups branches by remote name and strips the prefix from the display name', () => {
    useBranches.mockReturnValue({ data: [remoteBranch('origin/main'), remoteBranch('upstream/dev')] })
    renderSection()
    expect(screen.getByText('origin')).toBeInTheDocument()
    expect(screen.getByText('upstream')).toBeInTheDocument()
    expect(screen.getByText('main')).toBeInTheDocument()
    expect(screen.getByText('dev')).toBeInTheDocument()
  })

  it('falls back to "origin" as the group name when a branch has no remote prefix', () => {
    useBranches.mockReturnValue({ data: [remoteBranch('HEAD')] })
    renderSection()
    expect(screen.getByText('origin')).toBeInTheDocument()
  })

  it('shows ahead/behind indicators only when non-zero', () => {
    useBranches.mockReturnValue({ data: [remoteBranch('origin/main', { aheadCount: 1, behindCount: 2 })] })
    renderSection()
    expect(screen.getByText('↑1')).toBeInTheDocument()
    expect(screen.getByText('↓2')).toBeInTheDocument()
  })
})

describe('RemotesSection — selecting a branch', () => {
  it('selects using the full shortName (not the stripped display name) on click and Enter', () => {
    const onSelectBranch = vi.fn()
    useBranches.mockReturnValue({ data: [remoteBranch('origin/main')] })
    renderSection({ onSelectBranch })
    const row = screen.getByText('main').closest('[role="button"]')!

    fireEvent.click(row)
    expect(onSelectBranch).toHaveBeenCalledWith('origin/main')

    onSelectBranch.mockClear()
    fireEvent.keyDown(row, { key: 'Enter' })
    expect(onSelectBranch).toHaveBeenCalledWith('origin/main')
  })

  it('applies selected styling when selectedBranch matches', () => {
    useBranches.mockReturnValue({ data: [remoteBranch('origin/main')] })
    renderSection({ selectedBranch: 'origin/main' })
    const row = screen.getByText('main').closest('[role="button"]')!
    expect(row).toHaveClass('bg-accent')
  })
})

describe('RemotesSection — collapsing', () => {
  it('collapses/re-expands the whole section via SectionHeader', async () => {
    useBranches.mockReturnValue({ data: [remoteBranch('origin/main')] })
    const user = userEvent.setup()
    renderSection()
    await user.click(screen.getByText('Remotes'))
    expect(screen.queryByText('origin')).not.toBeInTheDocument()
  })

  it('collapses/re-expands a single remote group', async () => {
    useBranches.mockReturnValue({ data: [remoteBranch('origin/main')] })
    const user = userEvent.setup()
    renderSection()
    await user.click(screen.getByText('origin'))
    expect(screen.queryByText('main')).not.toBeInTheDocument()
  })
})

describe('RemotesSection — removing a remote', () => {
  it('removes the remote after confirmation and invalidates the branches query', async () => {
    mockedRemoveRemote.mockResolvedValue(undefined)
    useBranches.mockReturnValue({ data: [remoteBranch('origin/main')] })
    const { invalidateSpy } = renderSection()
    fireEvent.click(screen.getByLabelText('Remove remote origin'))

    expect(window.confirm).toHaveBeenCalledWith('Remove remote "origin"?')
    await vi.waitFor(() => expect(mockedRemoveRemote).toHaveBeenCalledWith('/repo', 'origin'))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['branches', '/repo'] })
  })

  it('does nothing when the confirmation is declined', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    useBranches.mockReturnValue({ data: [remoteBranch('origin/main')] })
    renderSection()
    fireEvent.click(screen.getByLabelText('Remove remote origin'))
    expect(mockedRemoveRemote).not.toHaveBeenCalled()
  })

  it('does not select the branch when removing the remote (stopPropagation)', () => {
    mockedRemoveRemote.mockResolvedValue(undefined)
    const onSelectBranch = vi.fn()
    useBranches.mockReturnValue({ data: [remoteBranch('origin/main')] })
    renderSection({ onSelectBranch })
    fireEvent.click(screen.getByLabelText('Remove remote origin'))
    expect(onSelectBranch).not.toHaveBeenCalled()
  })

  it('shows an alert when removal fails', async () => {
    mockedRemoveRemote.mockRejectedValue(new Error('remove failed'))
    useBranches.mockReturnValue({ data: [remoteBranch('origin/main')] })
    renderSection()
    fireEvent.click(screen.getByLabelText('Remove remote origin'))
    await vi.waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('remove failed')))
  })
})
