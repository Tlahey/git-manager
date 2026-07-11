import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key) }),
}))
vi.mock('../../api/git.api', () => ({ apiCreateBranch: vi.fn(), apiCheckoutBranch: vi.fn() }))

import { apiCreateBranch, apiCheckoutBranch } from '../../api/git.api'
import { CreateBranchHereDialog } from './CreateBranchHereDialog'

const mockedCreateBranch = apiCreateBranch as unknown as ReturnType<typeof vi.fn>
const mockedCheckoutBranch = apiCheckoutBranch as unknown as ReturnType<typeof vi.fn>

function renderDialog(props: Partial<React.ComponentProps<typeof CreateBranchHereDialog>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
  const utils = render(
    <QueryClientProvider client={client}>
      <CreateBranchHereDialog repoPath="/repo" oid="abc123" shortOid="abc123d" open onClose={vi.fn()} {...props} />
    </QueryClientProvider>
  )
  return { ...utils, invalidateSpy }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('CreateBranchHereDialog — rendering', () => {
  it('shows the title, "from <sha>" description, and a pre-checked checkout box', () => {
    renderDialog()
    expect(screen.getByText('gitTree.actions.createBranch')).toBeInTheDocument()
    expect(screen.getByText('gitTree.createBranch.from:{"sha":"abc123d"}')).toBeInTheDocument()
    expect(screen.getByRole('checkbox')).toBeChecked()
  })
})

describe('CreateBranchHereDialog — confirm gating', () => {
  it('disables confirm until a name is entered', async () => {
    const user = userEvent.setup()
    renderDialog()
    expect(screen.getByRole('button', { name: 'gitTree.contextMenu.create' })).toBeDisabled()
    await user.type(screen.getByPlaceholderText('gitTree.createBranch.placeholder'), 'feature-x')
    expect(screen.getByRole('button', { name: 'gitTree.contextMenu.create' })).toBeEnabled()
  })
})

describe('CreateBranchHereDialog — creating a branch', () => {
  it('creates the branch, checks it out by default, invalidates queries, and closes', async () => {
    mockedCreateBranch.mockResolvedValue(undefined)
    mockedCheckoutBranch.mockResolvedValue(undefined)
    const onClose = vi.fn()
    const user = userEvent.setup()
    const { invalidateSpy } = renderDialog({ onClose })
    await user.type(screen.getByPlaceholderText('gitTree.createBranch.placeholder'), 'feature-x{Enter}')

    expect(mockedCreateBranch).toHaveBeenCalledWith('/repo', 'feature-x', 'abc123')
    expect(mockedCheckoutBranch).toHaveBeenCalledWith('/repo', 'feature-x')
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['branches', '/repo'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['git-log', '/repo'] })
  })

  it('skips the checkout call when the checkbox is unchecked', async () => {
    mockedCreateBranch.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByRole('checkbox'))
    await user.type(screen.getByPlaceholderText('gitTree.createBranch.placeholder'), 'feature-x')
    await user.click(screen.getByRole('button', { name: 'gitTree.contextMenu.create' }))

    expect(mockedCreateBranch).toHaveBeenCalledWith('/repo', 'feature-x', 'abc123')
    expect(mockedCheckoutBranch).not.toHaveBeenCalled()
  })

  it('shows an inline error and stays open when branch creation fails', async () => {
    mockedCreateBranch.mockRejectedValue(new Error('branch already exists'))
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderDialog({ onClose })
    await user.type(screen.getByPlaceholderText('gitTree.createBranch.placeholder'), 'feature-x')
    await user.click(screen.getByRole('button', { name: 'gitTree.contextMenu.create' }))

    expect(await screen.findByText(/branch already exists/)).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows an inline error when the checkout after creation fails', async () => {
    mockedCreateBranch.mockResolvedValue(undefined)
    mockedCheckoutBranch.mockRejectedValue(new Error('checkout conflict'))
    const user = userEvent.setup()
    renderDialog()
    await user.type(screen.getByPlaceholderText('gitTree.createBranch.placeholder'), 'feature-x')
    await user.click(screen.getByRole('button', { name: 'gitTree.contextMenu.create' }))

    expect(await screen.findByText(/checkout conflict/)).toBeInTheDocument()
  })

  it('cancel calls onClose without creating a branch', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderDialog({ onClose })
    await user.click(screen.getByRole('button', { name: 'gitTree.contextMenu.cancel' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(mockedCreateBranch).not.toHaveBeenCalled()
  })
})
