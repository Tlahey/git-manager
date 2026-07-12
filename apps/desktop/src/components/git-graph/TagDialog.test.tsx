import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}))
vi.mock('../../api/git.api', () => ({ apiCreateTag: vi.fn() }))

import { apiCreateTag } from '../../api/git.api'
import { TagDialog } from './TagDialog'

const mockedCreateTag = apiCreateTag as unknown as ReturnType<typeof vi.fn>

function renderDialog(props: Partial<React.ComponentProps<typeof TagDialog>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
  const utils = render(
    <QueryClientProvider client={client}>
      <TagDialog
        repoPath="/repo"
        oid="abc123"
        shortOid="abc123d"
        annotated={false}
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

afterEach(() => {
  vi.restoreAllMocks()
})

describe('TagDialog — title and description', () => {
  it('shows the lightweight-tag title by default', () => {
    renderDialog()
    expect(screen.getByText('gitTree.contextMenu.createTag')).toBeInTheDocument()
    expect(screen.getByText('gitTree.createBranch.from:{"sha":"abc123d"}')).toBeInTheDocument()
  })

  it('shows the annotated-tag title and a message textarea when annotated', () => {
    renderDialog({ annotated: true })
    expect(screen.getByText('gitTree.contextMenu.createAnnotatedTag')).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText('gitTree.contextMenu.tagMessagePlaceholder')
    ).toBeInTheDocument()
  })

  it('does not show the message textarea for a lightweight tag', () => {
    renderDialog()
    expect(
      screen.queryByPlaceholderText('gitTree.contextMenu.tagMessagePlaceholder')
    ).not.toBeInTheDocument()
  })
})

describe('TagDialog — confirm gating', () => {
  it('disables confirm until a name is entered', async () => {
    const user = userEvent.setup()
    renderDialog()
    const confirm = screen.getByRole('button', { name: 'gitTree.contextMenu.create' })
    expect(confirm).toBeDisabled()
    await user.type(screen.getByPlaceholderText('gitTree.createBranch.placeholder'), 'v1.0.0')
    expect(confirm).toBeEnabled()
  })

  it('disables confirm again for a whitespace-only name', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.type(screen.getByPlaceholderText('gitTree.createBranch.placeholder'), '   ')
    expect(screen.getByRole('button', { name: 'gitTree.contextMenu.create' })).toBeDisabled()
  })
})

describe('TagDialog — creating a tag', () => {
  it('creates a lightweight tag on Enter, invalidates queries, and closes', async () => {
    mockedCreateTag.mockResolvedValue(undefined)
    const onClose = vi.fn()
    const user = userEvent.setup()
    const { invalidateSpy } = renderDialog({ onClose })
    await user.type(
      screen.getByPlaceholderText('gitTree.createBranch.placeholder'),
      'v1.0.0{Enter}'
    )

    expect(mockedCreateTag).toHaveBeenCalledWith('/repo', 'v1.0.0', 'abc123', undefined)
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['tags', '/repo'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['git-log', '/repo'] })
  })

  it('does not submit on Enter while annotated (message needs its own newlines)', async () => {
    const user = userEvent.setup()
    renderDialog({ annotated: true })
    await user.type(
      screen.getByPlaceholderText('gitTree.createBranch.placeholder'),
      'v2.0.0{Enter}'
    )
    expect(mockedCreateTag).not.toHaveBeenCalled()
  })

  it('creates an annotated tag with a trimmed message via the confirm button', async () => {
    mockedCreateTag.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderDialog({ annotated: true })
    await user.type(screen.getByPlaceholderText('gitTree.createBranch.placeholder'), 'v2.0.0')
    await user.type(
      screen.getByPlaceholderText('gitTree.contextMenu.tagMessagePlaceholder'),
      '  release notes  '
    )
    await user.click(screen.getByRole('button', { name: 'gitTree.contextMenu.create' }))

    expect(mockedCreateTag).toHaveBeenCalledWith('/repo', 'v2.0.0', 'abc123', 'release notes')
  })

  it('shows an inline error and stays open on failure', async () => {
    mockedCreateTag.mockRejectedValue(new Error('tag already exists'))
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderDialog({ onClose })
    await user.type(screen.getByPlaceholderText('gitTree.createBranch.placeholder'), 'v1.0.0')
    await user.click(screen.getByRole('button', { name: 'gitTree.contextMenu.create' }))

    expect(await screen.findByText(/tag already exists/)).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('cancel calls onClose without creating a tag', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderDialog({ onClose })
    await user.click(screen.getByRole('button', { name: 'gitTree.contextMenu.cancel' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(mockedCreateTag).not.toHaveBeenCalled()
  })
})
