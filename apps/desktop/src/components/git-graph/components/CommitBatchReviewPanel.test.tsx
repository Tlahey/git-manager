import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { CommitBatchReviewPanel } from './CommitBatchReviewPanel'
import type { CommitBatchReview } from '../../../hooks/useCommitBatchReview'
import type { ProcessedFileItem } from '../../common/CommitFileList'

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
      { commitMessage: 'feat: a', files: [file('src/a.ts')], accepted: true, kind: 'proposed' },
      {
        commitMessage: 'docs: b',
        files: [file('docs/b.md', 'added')],
        accepted: false,
        kind: 'proposed',
      },
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
    reconciliation: null,
    progress: null,
    hasStagedChanges: false,
    ...overrides,
  }
}

describe('CommitBatchReviewPanel', () => {
  it('renders nothing visible when closed', () => {
    render(<CommitBatchReviewPanel review={review({ isOpen: false })} />)
    expect(screen.queryByTestId('ai-batch-dialog')).not.toBeInTheDocument()
  })

  it('shows the loading state while generating', () => {
    render(<CommitBatchReviewPanel review={review({ isGenerating: true, proposals: [] })} />)
    expect(screen.getByTestId('ai-batch-loading')).toBeInTheDocument()
    // No progress on the single-shot path: it is one call, and the spinner already says so.
    expect(screen.queryByTestId('ai-batch-progress')).not.toBeInTheDocument()
  })

  /**
   * The two-phase planner makes one call per file, so on a large changeset it runs for minutes. A
   * bare spinner there reads as a hang.
   */
  it('counts the files while the two-phase planner reads them', () => {
    render(
      <CommitBatchReviewPanel
        review={review({
          isGenerating: true,
          proposals: [],
          progress: { phase: 'summarizing', completed: 7, total: 40 },
        })}
      />
    )
    expect(screen.getByTestId('ai-batch-progress')).toHaveTextContent(
      'Reading your files one by one — 7 of 40'
    )
    expect(screen.getByText('Close this panel to stop.')).toBeInTheDocument()
  })

  it('says when it has moved on to the grouping call', () => {
    render(
      <CommitBatchReviewPanel
        review={review({
          isGenerating: true,
          proposals: [],
          progress: { phase: 'composing', completed: 0, total: 1 },
        })}
      />
    )
    expect(screen.getByTestId('ai-batch-progress')).toHaveTextContent('Grouping them into commits')
  })

  it('shows the error and a regenerate button on failure', async () => {
    const regenerate = vi.fn()
    const user = userEvent.setup()
    render(
      <CommitBatchReviewPanel review={review({ error: 'ai down', proposals: [], regenerate })} />
    )
    expect(screen.getByTestId('ai-batch-error')).toHaveTextContent('ai down')
    await user.click(screen.getByText('Regenerate'))
    expect(regenerate).toHaveBeenCalled()
  })

  it('renders each proposal with its message and files', () => {
    render(<CommitBatchReviewPanel review={review()} />)
    expect(screen.getByText('AI-proposed commits')).toBeInTheDocument()
    expect(screen.getByTestId('ai-batch-proposal-0')).toBeInTheDocument()
    expect(screen.getByText('Commit 1')).toBeInTheDocument()
    expect(screen.getByTestId('ai-batch-message-0')).toHaveValue('feat: a')
    expect(screen.getByText('src/a.ts')).toBeInTheDocument()
    expect(screen.getByText('docs/b.md')).toBeInTheDocument()
  })

  it('mounts as a resizable right-hand panel rather than a centered dialog', () => {
    render(<CommitBatchReviewPanel review={review()} />)
    expect(screen.getByTestId('ai-batch-panel')).toBeInTheDocument()
    expect(screen.getByTestId('ai-batch-resize')).toBeInTheDocument()
  })

  /**
   * Guards the bug this panel replaced. A `max-h-[…]` ScrollArea does not scroll: Radix's viewport
   * is `h-full`, a percentage height against a max-height parent resolves to `auto`, so the viewport
   * never overflows itself, never gets a scrollbar, and the root's `overflow-hidden` clips the rest
   * out of reach. Only a resolved height — `flex-1` in a flex column — makes it scrollable.
   */
  it('gives the proposal list a flex-sized scroll pane, never a max-height one', () => {
    render(<CommitBatchReviewPanel review={review()} />)
    const scroll = screen.getByTestId('ai-batch-scroll')
    expect(scroll).toHaveClass('flex-1', 'min-h-0')
    expect(scroll.className).not.toMatch(/max-h-/)
  })

  it('stays quiet about reconciliation when the plan mapped cleanly', () => {
    render(<CommitBatchReviewPanel review={review()} />)
    expect(screen.queryByTestId('ai-batch-reconciliation')).not.toBeInTheDocument()
  })

  it('says how much of the plan the working tree could not accept', () => {
    render(
      <CommitBatchReviewPanel
        review={review({
          reconciliation: {
            discardedProposals: 2,
            unknownPaths: ['src/ghost.ts'],
            duplicatePaths: ['src/a.ts', 'src/b.ts'],
          },
        })}
      />
    )
    const notice = screen.getByTestId('ai-batch-reconciliation')
    expect(notice).toHaveTextContent('2 commit(s) dropped')
    expect(notice).toHaveTextContent('1 unknown path(s)')
    expect(notice).toHaveTextContent('2 path(s) proposed twice')
  })

  it('warns about losing a hand-picked staging, in terms of what is lost', () => {
    render(<CommitBatchReviewPanel review={review({ hasStagedChanges: true })} />)
    expect(screen.getByTestId('ai-batch-staging-notice')).toHaveTextContent(
      'What you staged by hand — individual hunks included — is not kept.'
    )
  })

  /** Shown to someone with nothing staged it warns about a loss that cannot happen to them, and a
   * warning that is usually irrelevant stops being read. */
  it('stays quiet when there is no staged selection to lose', () => {
    render(<CommitBatchReviewPanel review={review({ hasStagedChanges: false })} />)
    expect(screen.queryByTestId('ai-batch-staging-notice')).not.toBeInTheDocument()
  })

  /**
   * The unplaced group is unticked by default, so it renders greyed out with a disabled, empty
   * message box. Labelled "Commit 5" like everything else it read as a broken proposal, which is
   * exactly how it was reported. It needs its own name and an explanation that does not wait for
   * the tick that the explanation is there to prompt.
   */
  it('names the unplaced group and explains it before it is ticked', () => {
    render(
      <CommitBatchReviewPanel
        review={review({
          proposals: [
            {
              commitMessage: 'feat: a',
              files: [file('src/a.ts')],
              accepted: true,
              kind: 'proposed',
            },
            { commitMessage: '', files: [file('docs/b.md')], accepted: false, kind: 'unplaced' },
          ],
          validations: [
            { valid: true, problems: [] },
            { valid: true, problems: [] },
          ],
        })}
      />
    )
    expect(screen.getByText('Unplaced files')).toBeInTheDocument()
    expect(screen.queryByText('Commit 2')).not.toBeInTheDocument()
    expect(screen.getByTestId('ai-batch-unplaced-hint-1')).toHaveTextContent(
      "The AI didn't assign these to any commit"
    )
    // A real proposal keeps its numbered label and gets no such hint.
    expect(screen.getByText('Commit 1')).toBeInTheDocument()
    expect(screen.queryByTestId('ai-batch-unplaced-hint-0')).not.toBeInTheDocument()
  })

  it('tells the user an accepted group with no message will be skipped', () => {
    render(
      <CommitBatchReviewPanel
        review={review({
          // The unplaced group, once the user has ticked it but not written a message.
          proposals: [
            { commitMessage: '', files: [file('src/a.ts')], accepted: true, kind: 'unplaced' },
          ],
          validations: [{ valid: false, problems: [{ code: 'format', message: 'Bad format.' }] }],
        })}
      />
    )
    expect(screen.getByTestId('ai-batch-empty-0')).toHaveTextContent(
      'This commit needs a message, otherwise it will be skipped.'
    )
    // It replaces the convention warning, which on an empty subject only restates the same thing.
    expect(screen.queryByTestId('ai-batch-warning-0')).not.toBeInTheDocument()
  })

  it('toggles acceptance and edits a message through the callbacks', async () => {
    const toggleAccepted = vi.fn()
    const setMessage = vi.fn()
    const user = userEvent.setup()
    render(<CommitBatchReviewPanel review={review({ toggleAccepted, setMessage })} />)

    await user.click(screen.getByTestId('ai-batch-accept-1'))
    expect(toggleAccepted).toHaveBeenCalledWith(1)

    await user.type(screen.getByTestId('ai-batch-message-0'), '!')
    expect(setMessage).toHaveBeenCalled()
  })

  it('shows a convention warning on an accepted proposal that fails validation', () => {
    render(
      <CommitBatchReviewPanel
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
    const { rerender } = render(<CommitBatchReviewPanel review={review({ applyAccepted })} />)
    expect(screen.getByTestId('ai-batch-apply')).toHaveTextContent('Create 1 commit(s)')
    await user.click(screen.getByTestId('ai-batch-apply'))
    expect(applyAccepted).toHaveBeenCalled()

    rerender(<CommitBatchReviewPanel review={review({ canApply: false, acceptedCount: 0 })} />)
    expect(screen.getByTestId('ai-batch-apply')).toBeDisabled()
  })
})
