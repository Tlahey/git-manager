import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { GitBranch } from '@git-manager/git-types'

vi.mock('../../api/git.api', () => ({ apiSetBranchUpstream: vi.fn() }))

const { useBranches } = vi.hoisted(() => ({ useBranches: vi.fn() }))
vi.mock('../../hooks/useBranches', () => ({ useBranches }))

import { apiSetBranchUpstream } from '../../api/git.api'
import { SetUpstreamDialog } from './SetUpstreamDialog'

const mockedSetBranchUpstream = apiSetBranchUpstream as unknown as ReturnType<typeof vi.fn>

function branch(name: string, isRemote: boolean): GitBranch {
  return {
    name,
    shortName: isRemote ? name.split('/').slice(1).join('/') : name,
    isHead: false,
    isRemote,
    commitOid: 'oid',
    commitMessage: '',
    commitTimestamp: 0,
    aheadCount: 0,
    behindCount: 0,
  }
}

function renderDialog(props: Partial<React.ComponentProps<typeof SetUpstreamDialog>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
  const utils = render(
    <QueryClientProvider client={client}>
      <SetUpstreamDialog repoPath="/repo" branch="feat" open onClose={vi.fn()} {...props} />
    </QueryClientProvider>
  )
  return { ...utils, invalidateSpy }
}

beforeEach(() => {
  vi.clearAllMocks()
  useBranches.mockReturnValue({ data: [branch('feat', false), branch('origin/feat', true)] })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SetUpstreamDialog — rendering', () => {
  it('shows the title/description and preselects origin/<branch> when it exists', () => {
    renderDialog()
    expect(screen.getByText('Set upstream branch')).toBeInTheDocument()
    expect(screen.getByText('Choose the remote-tracking branch feat should follow.')).toBeInTheDocument()
    expect(screen.getByTestId('set-upstream-select')).toHaveValue('origin/feat')
  })

  it('lists every remote-tracking branch as an option', () => {
    useBranches.mockReturnValue({
      data: [branch('feat', false), branch('origin/feat', true), branch('upstream/feat', true)],
    })
    renderDialog()
    const select = screen.getByTestId('set-upstream-select') as HTMLSelectElement
    const options = Array.from(select.options).map((o) => o.value)
    expect(options).toEqual(['origin/feat', 'upstream/feat'])
  })

  it('shows an empty state and disables confirm when there is no remote-tracking branch', () => {
    useBranches.mockReturnValue({ data: [branch('feat', false)] })
    renderDialog()
    expect(screen.getByTestId('set-upstream-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('set-upstream-select')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Set upstream' })).toBeDisabled()
  })
})

describe('SetUpstreamDialog — confirming', () => {
  it('sets the upstream to the preselected candidate, invalidates queries, and closes', async () => {
    mockedSetBranchUpstream.mockResolvedValue(undefined)
    const onClose = vi.fn()
    const user = userEvent.setup()
    const { invalidateSpy } = renderDialog({ onClose })

    await user.click(screen.getByRole('button', { name: 'Set upstream' }))

    expect(mockedSetBranchUpstream).toHaveBeenCalledWith('/repo', 'feat', 'origin/feat')
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['branches', '/repo'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['git-log', '/repo'] })
  })

  it('sets the upstream to whichever candidate the user picks', async () => {
    useBranches.mockReturnValue({
      data: [branch('feat', false), branch('origin/feat', true), branch('upstream/feat', true)],
    })
    mockedSetBranchUpstream.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderDialog()

    await user.selectOptions(screen.getByTestId('set-upstream-select'), 'upstream/feat')
    await user.click(screen.getByRole('button', { name: 'Set upstream' }))

    expect(mockedSetBranchUpstream).toHaveBeenCalledWith('/repo', 'feat', 'upstream/feat')
  })

  it('shows an inline error and stays open when setting the upstream fails', async () => {
    mockedSetBranchUpstream.mockRejectedValue(new Error('branch not found'))
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderDialog({ onClose })

    await user.click(screen.getByRole('button', { name: 'Set upstream' }))

    expect(await screen.findByText(/branch not found/)).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('cancel closes without setting anything', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderDialog({ onClose })
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(mockedSetBranchUpstream).not.toHaveBeenCalled()
  })
})
