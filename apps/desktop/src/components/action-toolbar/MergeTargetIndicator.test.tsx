import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MergeTargetStatus } from '@git-manager/git-types'

const useMergeTargetStatusMock = vi.fn()
vi.mock('../../hooks/useMergeTargetStatus', () => ({
  useMergeTargetStatus: (path: string | null) => useMergeTargetStatusMock(path),
}))

import { MergeTargetIndicator } from './MergeTargetIndicator'

function status(overrides: Partial<MergeTargetStatus> = {}): MergeTargetStatus {
  return {
    target: 'origin/main',
    currentBranch: 'feature/x',
    onTarget: false,
    hasConflicts: false,
    conflictedFiles: [],
    ahead: 2,
    behind: 1,
    ...overrides,
  }
}

/** Makes the mocked hook answer with `data` (or nothing at all). */
function mockStatus(data: MergeTargetStatus | undefined) {
  useMergeTargetStatusMock.mockReturnValue({ data })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('MergeTargetIndicator', () => {
  it('renders nothing while the status has not loaded yet', () => {
    mockStatus(undefined)
    const { container } = render(<MergeTargetIndicator repoPath="/repo" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when no target branch exists in the repo', () => {
    mockStatus(status({ target: null }))
    const { container } = render(<MergeTargetIndicator repoPath="/repo" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the target branch is the one checked out', () => {
    mockStatus(status({ onTarget: true, currentBranch: 'main' }))
    const { container } = render(<MergeTargetIndicator repoPath="/repo" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a muted indicator off the target branch when the merge is clean', () => {
    mockStatus(status())
    render(<MergeTargetIndicator repoPath="/repo" />)

    const trigger = screen.getByTestId('merge-target-indicator')
    expect(trigger).toHaveAttribute('data-state-tone', 'clean')
    expect(trigger).toHaveAccessibleName(
      'Your current branch feature/x will not cause conflicts when merging with its target branch origin/main.'
    )
  })

  it('turns amber when merging into the target would conflict', () => {
    mockStatus(status({ hasConflicts: true, conflictedFiles: ['src/a.ts'] }))
    render(<MergeTargetIndicator repoPath="/repo" />)

    const trigger = screen.getByTestId('merge-target-indicator')
    expect(trigger).toHaveAttribute('data-state-tone', 'conflict')
    expect(trigger).toHaveAccessibleName(
      'Your current branch feature/x would cause conflicts when merging with its target branch origin/main.'
    )
  })

  it('states on hover that no conflict was detected, tagging the target branch', async () => {
    const user = userEvent.setup()
    mockStatus(status())
    render(<MergeTargetIndicator repoPath="/repo" />)

    await user.hover(screen.getByTestId('merge-target-indicator'))

    const tooltip = await screen.findByTestId('merge-target-tooltip')
    expect(tooltip).toHaveTextContent('No conflicts detected against origin/main')
    // The branch name is its own Tag element, not plain text spliced into the sentence.
    expect(tooltip.querySelector('span')).toHaveTextContent('origin/main')
  })

  it('counts the conflicting files on hover when the merge would conflict', async () => {
    const user = userEvent.setup()
    mockStatus(status({ hasConflicts: true, conflictedFiles: ['src/a.ts', 'src/b.ts'] }))
    render(<MergeTargetIndicator repoPath="/repo" />)

    await user.hover(screen.getByTestId('merge-target-indicator'))

    expect(await screen.findByTestId('merge-target-tooltip')).toHaveTextContent(
      '2 conflicting files against origin/main'
    )
  })

  it('uses the singular wording for a single conflicting file', async () => {
    const user = userEvent.setup()
    mockStatus(status({ hasConflicts: true, conflictedFiles: ['src/a.ts'] }))
    render(<MergeTargetIndicator repoPath="/repo" />)

    await user.hover(screen.getByTestId('merge-target-indicator'))

    expect(await screen.findByTestId('merge-target-tooltip')).toHaveTextContent(
      '1 conflicting file against origin/main'
    )
  })

  it('falls back to a countless conflict wording when the file list is empty', async () => {
    const user = userEvent.setup()
    mockStatus(status({ hasConflicts: true, conflictedFiles: [] }))
    render(<MergeTargetIndicator repoPath="/repo" />)

    await user.hover(screen.getByTestId('merge-target-indicator'))

    expect(await screen.findByTestId('merge-target-tooltip')).toHaveTextContent(
      'Conflicts detected against origin/main'
    )
  })

  it('drops the hover tooltip once the popover is open, so the two never overlap', async () => {
    const user = userEvent.setup()
    mockStatus(status())
    render(<MergeTargetIndicator repoPath="/repo" />)

    await user.hover(screen.getByTestId('merge-target-indicator'))
    expect(await screen.findByTestId('merge-target-tooltip')).toBeInTheDocument()

    await user.click(screen.getByTestId('merge-target-indicator'))

    expect(screen.getByTestId('merge-target-popover')).toBeInTheDocument()
    expect(screen.queryByTestId('merge-target-tooltip')).not.toBeInTheDocument()
  })

  it('details the clean state, the two branches and the divergence in its popover', async () => {
    const user = userEvent.setup()
    mockStatus(status())
    render(<MergeTargetIndicator repoPath="/repo" />)

    await user.click(screen.getByTestId('merge-target-indicator'))

    expect(screen.getByText('Up to date with merge target')).toBeInTheDocument()
    expect(screen.getByTestId('merge-target-branch')).toHaveTextContent('feature/x')
    expect(screen.getByTestId('merge-target-target')).toHaveTextContent('origin/main')
    expect(screen.getByTestId('merge-target-divergence')).toHaveTextContent(
      '2 commit(s) ahead, 1 behind the target.'
    )
    expect(screen.queryByTestId('merge-target-conflicted-files')).not.toBeInTheDocument()
  })

  it('lists the conflicting files in its popover', async () => {
    const user = userEvent.setup()
    mockStatus(status({ hasConflicts: true, conflictedFiles: ['src/a.ts', 'src/b.ts'] }))
    render(<MergeTargetIndicator repoPath="/repo" />)

    await user.click(screen.getByTestId('merge-target-indicator'))

    expect(screen.getByText('Conflicts with merge target')).toBeInTheDocument()
    expect(screen.getByTestId('merge-target-conflicted-files')).toHaveTextContent(
      '2 conflicting files'
    )
    expect(screen.getByText('src/a.ts')).toBeInTheDocument()
    expect(screen.getByText('src/b.ts')).toBeInTheDocument()
  })

  it('opens the settings from the popover and closes it', async () => {
    const user = userEvent.setup()
    const onOpenSettings = vi.fn()
    mockStatus(status())
    render(<MergeTargetIndicator repoPath="/repo" onOpenSettings={onOpenSettings} />)

    await user.click(screen.getByTestId('merge-target-indicator'))
    await user.click(screen.getByText('Set target branches in settings'))

    expect(onOpenSettings).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('merge-target-popover')).not.toBeInTheDocument()
  })

  it('hides the settings shortcut when no handler is provided', async () => {
    const user = userEvent.setup()
    mockStatus(status())
    render(<MergeTargetIndicator repoPath="/repo" />)

    await user.click(screen.getByTestId('merge-target-indicator'))

    expect(screen.queryByTestId('merge-target-settings-link')).not.toBeInTheDocument()
  })

  it('falls back to a detached-HEAD label when there is no current branch', () => {
    mockStatus(status({ currentBranch: null }))
    render(<MergeTargetIndicator repoPath="/repo" />)

    expect(screen.getByTestId('merge-target-indicator')).toHaveAccessibleName(
      'Your current branch detached HEAD will not cause conflicts when merging with its target branch origin/main.'
    )
  })
})
