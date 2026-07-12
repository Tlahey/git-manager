import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { GitGraphNode } from '@git-manager/git-types'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

const useGitLogMock = vi.fn()
vi.mock('../../hooks/useGitLog', () => ({ useGitLog: () => useGitLogMock() }))

vi.mock('../../api/git.api', () => ({ apiCreateFixupCommit: vi.fn() }))

import { apiCreateFixupCommit } from '../../api/git.api'
import { FixupTargetSelector } from './FixupTargetSelector'

const mockedCreateFixup = apiCreateFixupCommit as unknown as ReturnType<typeof vi.fn>

function node(oid: string, subject: string): GitGraphNode {
  return {
    commit: {
      oid,
      shortOid: oid.slice(0, 7),
      message: subject,
      subject,
      body: '',
      author: { name: 'a', email: 'a@x.com', timestamp: 1700000000 },
      committer: { name: 'a', email: 'a@x.com', timestamp: 1700000000 },
      parentOids: [],
    },
    column: 0,
    color: '#000',
    connections: [],
    refs: [],
  } as GitGraphNode
}

function renderSelector(
  props: Partial<{
    open: boolean
    onClose: () => void
    onSelect: (oid: string, subject: string) => void
  }> = {}
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <FixupTargetSelector
        repoPath="/repo"
        open={props.open ?? true}
        onClose={props.onClose ?? vi.fn()}
        onSelect={props.onSelect ?? vi.fn()}
      />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useGitLogMock.mockReturnValue({
    data: [node('abc1234', 'Add feature'), node('def5678', 'Fix bug')],
    isLoading: false,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('FixupTargetSelector', () => {
  it('lists commits from the log', () => {
    renderSelector()
    expect(screen.getByText('Add feature')).toBeInTheDocument()
    expect(screen.getByText('Fix bug')).toBeInTheDocument()
  })

  it('shows a spinner while the log is loading', () => {
    useGitLogMock.mockReturnValue({ data: [], isLoading: true })
    renderSelector()
    expect(screen.queryByText('Add feature')).not.toBeInTheDocument()
  })

  it('filters commits by subject or short oid', async () => {
    const user = userEvent.setup()
    renderSelector()
    await user.type(screen.getByPlaceholderText('fixup.searchCommits'), 'fix')
    expect(screen.getByText('Fix bug')).toBeInTheDocument()
    expect(screen.queryByText('Add feature')).not.toBeInTheDocument()
  })

  it('disables confirm until a commit is selected', async () => {
    const user = userEvent.setup()
    renderSelector()
    expect(screen.getAllByRole('button', { name: 'fixup.createTitle' })[0]).toBeDisabled()
    await user.click(screen.getByText('Add feature'))
    expect(screen.getAllByRole('button', { name: 'fixup.createTitle' })[0]).toBeEnabled()
  })

  it('confirms the fixup, invalidates queries, and calls onSelect + onClose', async () => {
    mockedCreateFixup.mockResolvedValue({ oid: 'new' })
    const onSelect = vi.fn()
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderSelector({ onSelect, onClose })

    await user.click(screen.getByText('Add feature'))
    await user.click(screen.getAllByRole('button', { name: 'fixup.createTitle' })[0])

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('abc1234', 'Add feature'))
    expect(mockedCreateFixup).toHaveBeenCalledWith('/repo', 'abc1234')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows an inline error and does not close on failure', async () => {
    mockedCreateFixup.mockRejectedValue(new Error('fixup failed'))
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderSelector({ onClose })

    await user.click(screen.getByText('Add feature'))
    await user.click(screen.getAllByRole('button', { name: 'fixup.createTitle' })[0])

    await waitFor(() => expect(screen.getByText(/fixup failed/)).toBeInTheDocument())
    expect(onClose).not.toHaveBeenCalled()
  })

  it('cancel calls onClose without creating a fixup', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderSelector({ onClose })
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(mockedCreateFixup).not.toHaveBeenCalled()
  })
})
