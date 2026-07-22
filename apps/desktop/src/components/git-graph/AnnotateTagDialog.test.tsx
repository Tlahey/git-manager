import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../../api/git.api', () => ({ apiAnnotateTag: vi.fn() }))

import { apiAnnotateTag } from '../../api/git.api'
import { AnnotateTagDialog } from './AnnotateTagDialog'

const mockedAnnotate = apiAnnotateTag as unknown as ReturnType<typeof vi.fn>

function renderDialog(props: Partial<React.ComponentProps<typeof AnnotateTagDialog>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
  const utils = render(
    <QueryClientProvider client={client}>
      <AnnotateTagDialog
        repoPath="/repo"
        tagName="v1.0.0"
        oid="abc123"
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

describe('AnnotateTagDialog', () => {
  it('shows the tag name in the title and a message textarea', () => {
    renderDialog()
    expect(screen.getByText('Annotate v1.0.0')).toBeInTheDocument()
    expect(screen.getByTestId('annotate-tag-message')).toBeInTheDocument()
  })

  it('disables confirm until a non-empty message is entered', async () => {
    const user = userEvent.setup()
    renderDialog()
    const confirm = screen.getByTestId('annotate-tag-confirm')
    expect(confirm).toBeDisabled()
    await user.type(screen.getByTestId('annotate-tag-message'), '   ')
    expect(confirm).toBeDisabled()
    await user.type(screen.getByTestId('annotate-tag-message'), 'release notes')
    expect(confirm).toBeEnabled()
  })

  it('annotates with a trimmed message, invalidates queries, and closes', async () => {
    mockedAnnotate.mockResolvedValue(undefined)
    const onClose = vi.fn()
    const user = userEvent.setup()
    const { invalidateSpy } = renderDialog({ onClose })
    await user.type(screen.getByTestId('annotate-tag-message'), '  release notes  ')
    await user.click(screen.getByTestId('annotate-tag-confirm'))

    expect(mockedAnnotate).toHaveBeenCalledWith('/repo', 'v1.0.0', 'abc123', 'release notes')
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['tags', '/repo'] })
  })

  it('shows an inline error and stays open on failure', async () => {
    mockedAnnotate.mockRejectedValue(new Error('boom'))
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderDialog({ onClose })
    await user.type(screen.getByTestId('annotate-tag-message'), 'notes')
    await user.click(screen.getByTestId('annotate-tag-confirm'))

    expect(await screen.findByText(/boom/)).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })
})
