import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../../../api/git.api', () => ({
  apiCreateBranch: vi.fn(),
  apiCreateAndCheckoutBranch: vi.fn(),
}))

import { apiCreateBranch, apiCreateAndCheckoutBranch } from '../../../api/git.api'
import { CreateBranchHereDialog } from './CreateBranchHereDialog'

const mockedCreateBranch = apiCreateBranch as unknown as ReturnType<typeof vi.fn>
const mockedCreateAndCheckout = apiCreateAndCheckoutBranch as unknown as ReturnType<typeof vi.fn>

function renderDialog(props: Partial<React.ComponentProps<typeof CreateBranchHereDialog>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
  const utils = render(
    <QueryClientProvider client={client}>
      <CreateBranchHereDialog
        repoPath="/repo"
        oid="abc123"
        shortOid="abc123d"
        open
        onClose={vi.fn()}
        {...props}
      />
    </QueryClientProvider>
  )
  return { ...utils, invalidateSpy }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CreateBranchHereDialog — rendering', () => {
  it('shows the title, "from <sha>" description, and a pre-checked checkout box', () => {
    renderDialog()
    expect(screen.getByText('Create branch here')).toBeInTheDocument()
    expect(screen.getByText('From commit abc123d')).toBeInTheDocument()
    expect(screen.getByRole('checkbox')).toBeChecked()
  })
})

describe('CreateBranchHereDialog — confirm gating', () => {
  it('disables confirm until a name is entered', async () => {
    const user = userEvent.setup()
    renderDialog()
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
    await user.type(screen.getByPlaceholderText('Branch name...'), 'feature-x')
    expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled()
  })
})

describe('CreateBranchHereDialog — creating a branch', () => {
  it('creates and checks out through the composed API, invalidates queries, and closes', async () => {
    mockedCreateAndCheckout.mockResolvedValue(undefined)
    const onClose = vi.fn()
    const user = userEvent.setup()
    const { invalidateSpy } = renderDialog({ onClose })
    await user.type(screen.getByPlaceholderText('Branch name...'), 'feature-x{Enter}')

    // The pair goes through one call on purpose: assembled by hand it silently became a
    // half-undoable gesture — ⌘Z would try to delete a branch git had just made HEAD, which it
    // refuses (see `apiCreateAndCheckoutBranch` and the store's gesture tests).
    expect(mockedCreateAndCheckout).toHaveBeenCalledWith('/repo', 'feature-x', 'abc123')
    expect(mockedCreateBranch).not.toHaveBeenCalled()
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['branches', '/repo'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['git-log', '/repo'] })
  })

  it('creates without checking out when the checkbox is unchecked', async () => {
    mockedCreateBranch.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByRole('checkbox'))
    await user.type(screen.getByPlaceholderText('Branch name...'), 'feature-x')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    expect(mockedCreateBranch).toHaveBeenCalledWith('/repo', 'feature-x', 'abc123')
    expect(mockedCreateAndCheckout).not.toHaveBeenCalled()
  })

  it('shows an inline error and stays open when the gesture fails', async () => {
    mockedCreateAndCheckout.mockRejectedValue(new Error('branch already exists'))
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderDialog({ onClose })
    await user.type(screen.getByPlaceholderText('Branch name...'), 'feature-x')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    expect(await screen.findByText(/branch already exists/)).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows an inline error when creating without checkout fails', async () => {
    mockedCreateBranch.mockRejectedValue(new Error('branch already exists'))
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByRole('checkbox'))
    await user.type(screen.getByPlaceholderText('Branch name...'), 'feature-x')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    expect(await screen.findByText(/branch already exists/)).toBeInTheDocument()
  })

  it('cancel calls onClose without creating a branch', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderDialog({ onClose })
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(mockedCreateBranch).not.toHaveBeenCalled()
    expect(mockedCreateAndCheckout).not.toHaveBeenCalled()
  })
})
