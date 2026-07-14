import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}))

import { CommitBatchReviewDialog } from './CommitBatchReviewDialog'
import type { CommitBatchReview } from '../../../hooks/useCommitBatchReview'
import type { ProcessedFileItem } from './CommitFileList'

function file(path: string, status = 'modified'): ProcessedFileItem {
  return { path, status, staged: false } as ProcessedFileItem
}

function review(overrides: Partial<CommitBatchReview> = {}): CommitBatchReview {
  return {
    isOpen: true,
    openAndGenerate: vi.fn(),
    regenerate: vi.fn(),
    close: vi.fn(),
    isGenerating: false,
    isApplying: false,
    error: null,
    proposals: [
      { commitMessage: 'feat: a', files: [file('src/a.ts')], accepted: true },
      { commitMessage: 'docs: b', files: [file('docs/b.md', 'added')], accepted: false },
    ],
    setMessage: vi.fn(),
    toggleAccepted: vi.fn(),
    applyAccepted: vi.fn(),
    canApply: true,
    acceptedCount: 1,
    validations: [
      { valid: true, problems: [] },
      { valid: true, problems: [] },
    ],
    ...overrides,
  } as CommitBatchReview
}

describe('CommitBatchReviewDialog', () => {
  it('renders nothing visible when closed', () => {
    render(<CommitBatchReviewDialog review={review({ isOpen: false })} />)
    expect(screen.queryByTestId('ai-batch-dialog')).not.toBeInTheDocument()
  })

  it('shows the loading state while generating', () => {
    render(<CommitBatchReviewDialog review={review({ isGenerating: true, proposals: [] })} />)
    expect(screen.getByTestId('ai-batch-loading')).toBeInTheDocument()
  })

  it('shows the error and a regenerate button on failure', async () => {
    const regenerate = vi.fn()
    const user = userEvent.setup()
    render(
      <CommitBatchReviewDialog
        review={review({ error: 'ai down', proposals: [], regenerate })}
      />
    )
    expect(screen.getByTestId('ai-batch-error')).toHaveTextContent('ai down')
    await user.click(screen.getByText('commitDetails.aiBatch.regenerate'))
    expect(regenerate).toHaveBeenCalled()
  })

  it('renders each proposal with its message and files', () => {
    render(<CommitBatchReviewDialog review={review()} />)
    expect(screen.getByTestId('ai-batch-proposal-0')).toBeInTheDocument()
    expect(screen.getByTestId('ai-batch-message-0')).toHaveValue('feat: a')
    expect(screen.getByText('src/a.ts')).toBeInTheDocument()
    expect(screen.getByText('docs/b.md')).toBeInTheDocument()
  })

  it('toggles acceptance and edits a message through the callbacks', async () => {
    const toggleAccepted = vi.fn()
    const setMessage = vi.fn()
    const user = userEvent.setup()
    render(<CommitBatchReviewDialog review={review({ toggleAccepted, setMessage })} />)

    await user.click(screen.getByTestId('ai-batch-accept-1'))
    expect(toggleAccepted).toHaveBeenCalledWith(1)

    await user.type(screen.getByTestId('ai-batch-message-0'), '!')
    expect(setMessage).toHaveBeenCalled()
  })

  it('shows a convention warning on an accepted proposal that fails validation', () => {
    render(
      <CommitBatchReviewDialog
        review={review({
          validations: [
            { valid: false, problems: [{ code: 'type', message: 'Type "wip" is not allowed.' }] },
            { valid: true, problems: [] },
          ],
        })}
      />
    )
    expect(screen.getByTestId('ai-batch-warning-0')).toHaveTextContent('Type "wip" is not allowed.')
    // The second proposal is rejected, so no warning even if it were invalid.
    expect(screen.queryByTestId('ai-batch-warning-1')).not.toBeInTheDocument()
  })

  it('applies the accepted commits and disables apply when none are applicable', async () => {
    const applyAccepted = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(
      <CommitBatchReviewDialog review={review({ applyAccepted })} />
    )
    await user.click(screen.getByTestId('ai-batch-apply'))
    expect(applyAccepted).toHaveBeenCalled()

    rerender(<CommitBatchReviewDialog review={review({ canApply: false, acceptedCount: 0 })} />)
    expect(screen.getByTestId('ai-batch-apply')).toBeDisabled()
  })
})
