import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { GitStatus, RebaseProgressStep, RebaseState } from '@git-manager/git-types'

const { useConflictedFiles, useGitStatus, swrMutate } = vi.hoisted(() => ({
  useConflictedFiles: vi.fn(),
  useGitStatus: vi.fn(),
  swrMutate: vi.fn(),
}))
vi.mock('../../hooks/useConflictedFiles', () => ({ useConflictedFiles }))
vi.mock('../../hooks/useGitStatus', () => ({ useGitStatus }))
vi.mock('swr', () => ({ mutate: swrMutate }))
vi.mock('../../api/git.api', () => ({
  apiRebaseAbort: vi.fn(),
  apiRebaseContinue: vi.fn(),
  apiRebaseSkip: vi.fn(),
}))

import { apiRebaseAbort, apiRebaseContinue, apiRebaseSkip } from '../../api/git.api'
import { useRebaseViewStore } from '../../stores/rebaseView.store'
import { RebaseProgressCenter } from './RebaseProgressCenter'

const mockedAbort = apiRebaseAbort as unknown as ReturnType<typeof vi.fn>
const mockedContinue = apiRebaseContinue as unknown as ReturnType<typeof vi.fn>
const mockedSkip = apiRebaseSkip as unknown as ReturnType<typeof vi.fn>

function step(overrides: Partial<RebaseProgressStep> = {}): RebaseProgressStep {
  return { index: 1, action: 'pick', status: 'pending', ...overrides }
}

function rebaseState(overrides: Partial<RebaseState> = {}): RebaseState {
  return {
    kind: 'conflict',
    branchName: 'feature/login',
    ontoLabel: 'main',
    ontoShortOid: '9636ae7',
    ontoSubject: 'chore: bump deps',
    currentStep: 2,
    totalSteps: 3,
    steps: [
      step({ index: 1, status: 'done', subject: 'feat: first', shortOid: 'aaaaaaa' }),
      step({ index: 2, status: 'current', subject: 'feat: second', shortOid: 'bbbbbbb' }),
      step({ index: 3, status: 'pending', subject: 'feat: third', shortOid: 'ccccccc' }),
    ],
    ...overrides,
  }
}

function gitStatus(overrides: Partial<GitStatus> = {}): GitStatus {
  return { staged: [], unstaged: [], untracked: [], conflicted: [], ...overrides }
}

function renderCenter(
  state: RebaseState = rebaseState(),
  props: Partial<React.ComponentProps<typeof RebaseProgressCenter>> = {}
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onSelectStep = props.onSelectStep ?? vi.fn()
  const utils = render(
    <QueryClientProvider client={client}>
      <RebaseProgressCenter
        repoPath="/repo"
        rebaseState={state}
        {...props}
        onSelectStep={onSelectStep}
      />
    </QueryClientProvider>
  )
  return { ...utils, onSelectStep }
}

beforeEach(() => {
  vi.clearAllMocks()
  useRebaseViewStore.setState({ views: {} })
  useConflictedFiles.mockReturnValue({ data: [] })
  useGitStatus.mockReturnValue({ data: gitStatus() })
})

describe('RebaseProgressCenter — header', () => {
  it('names the branch being rebased and what it is going onto', () => {
    renderCenter()
    expect(screen.getByText('Rebase in progress')).toBeInTheDocument()
    expect(screen.getByTestId('rebase-progress-branch')).toHaveTextContent('feature/login')
    expect(screen.getByTestId('rebase-progress-onto')).toHaveTextContent('main')
  })

  it("falls back to the onto commit's short SHA when no ref points at it", () => {
    renderCenter(rebaseState({ ontoLabel: undefined }))
    expect(screen.getByTestId('rebase-progress-onto')).toHaveTextContent('9636ae7')
  })

  it("reports git's own step counter", () => {
    renderCenter()
    expect(screen.getByTestId('rebase-progress-counter')).toHaveTextContent('Step 2 of 3')
  })

  // The am backend writes no msgnum/end, but the parsed plan still says where we are.
  it('derives the counter from the plan when git reports no counters', () => {
    renderCenter(rebaseState({ currentStep: undefined, totalSteps: undefined }))
    expect(screen.getByTestId('rebase-progress-counter')).toHaveTextContent('Step 2 of 3')
  })

  it('labels the pause kind', () => {
    renderCenter()
    expect(screen.getByTestId('rebase-progress-status')).toHaveTextContent('Paused on a conflict')
    renderCenter(rebaseState({ kind: 'edit_pause' }))
    expect(screen.getAllByTestId('rebase-progress-status')[1]).toHaveTextContent(
      'Paused for editing'
    )
  })

  it('hides itself for this repo only when Hide is pressed', async () => {
    const user = userEvent.setup()
    renderCenter()
    await user.click(screen.getByTestId('rebase-progress-hide'))
    expect(useRebaseViewStore.getState().views).toEqual({ '/repo': { progressHidden: true } })
  })
})

describe('RebaseProgressCenter — conflicted files toggle', () => {
  it('flips the files panel through the caller, which owns the graph selection', async () => {
    const user = userEvent.setup()
    const onToggleFilesPanel = vi.fn()
    renderCenter(rebaseState(), { filesPanelOpen: true, onToggleFilesPanel })
    await user.click(screen.getByTestId('rebase-progress-toggle-files'))
    expect(onToggleFilesPanel).toHaveBeenCalledOnce()
  })

  it('reflects whether the panel is currently up', () => {
    renderCenter(rebaseState(), { filesPanelOpen: true, onToggleFilesPanel: vi.fn() })
    expect(screen.getByTestId('rebase-progress-toggle-files')).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByTestId('rebase-progress-toggle-files')).toHaveAttribute(
      'title',
      'Hide the conflicted files panel'
    )
  })

  it('offers to bring the panel back when it is hidden', () => {
    renderCenter(rebaseState(), { filesPanelOpen: false, onToggleFilesPanel: vi.fn() })
    const toggle = screen.getByTestId('rebase-progress-toggle-files')
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(toggle).toHaveAttribute('title', 'Show the conflicted files panel')
  })

  // The view is also rendered without the panel wiring (e.g. a caller that owns no right panel).
  it('omits the toggle entirely when no handler is given', () => {
    renderCenter()
    expect(screen.queryByTestId('rebase-progress-toggle-files')).not.toBeInTheDocument()
  })
})

describe('RebaseProgressCenter — step rail', () => {
  it('lists the base row then every step, oldest first', () => {
    renderCenter()
    expect(screen.getByTestId('rebase-step-base')).toHaveTextContent('Replaying onto main')
    expect(screen.getByTestId('rebase-step-base')).toHaveTextContent('chore: bump deps')
    expect(screen.getByTestId('rebase-step-1')).toHaveTextContent('feat: first')
    expect(screen.getByTestId('rebase-step-2')).toHaveTextContent('feat: second')
    expect(screen.getByTestId('rebase-step-3')).toHaveTextContent('feat: third')
  })

  it('marks each step done, current or pending on the rail', () => {
    renderCenter()
    expect(screen.getByTestId('rebase-step-1')).toHaveAttribute('data-progress', 'done')
    expect(screen.getByTestId('rebase-step-2')).toHaveAttribute('data-progress', 'current')
    expect(screen.getByTestId('rebase-step-3')).toHaveAttribute('data-progress', 'pending')
  })

  it('tells the user what is left to do on the step git stopped on', () => {
    useConflictedFiles.mockReturnValue({ data: ['src/a.ts', 'src/b.ts'] })
    renderCenter()
    expect(screen.getByTestId('rebase-step-2')).toHaveTextContent(
      'Stopped here — 2 files left to resolve'
    )
    expect(screen.getByTestId('rebase-step-1')).toHaveTextContent('Replayed')
    expect(screen.getByTestId('rebase-step-3')).toHaveTextContent('Not replayed yet')
  })

  it('says the paused step is ready to continue once nothing conflicts', () => {
    renderCenter()
    expect(screen.getByTestId('rebase-step-2')).toHaveTextContent(
      'Stopped here — everything resolved, continue the rebase'
    )
  })

  it('hands the whole step to the caller when a row is clicked', async () => {
    const user = userEvent.setup()
    const done = step({ index: 1, status: 'done', oid: 'oid-1', subject: 'feat: first' })
    const { onSelectStep } = renderCenter(rebaseState({ steps: [done] }))
    await user.click(screen.getByTestId('rebase-step-1'))
    expect(onSelectStep).toHaveBeenCalledWith(done)
  })

  // The paused step is the one with work to do; the caller turns this into "show the conflicted
  // files", so it stays clickable even though its commit may not be in the graph.
  it('keeps the paused step clickable regardless of what the caller considers selectable', async () => {
    const user = userEvent.setup()
    const current = step({ index: 1, status: 'current', oid: 'oid-1', subject: 'feat: stuck' })
    const { onSelectStep } = renderCenter(rebaseState({ steps: [current] }), {
      isStepSelectable: () => false,
    })
    await user.click(screen.getByTestId('rebase-step-1'))
    expect(onSelectStep).toHaveBeenCalledWith(current)
  })

  // Selecting a commit the graph never loaded would render an empty details panel — the row must
  // not even look clickable.
  it('does not open a step whose commit the caller cannot show', async () => {
    const user = userEvent.setup()
    const { onSelectStep } = renderCenter(
      rebaseState({
        steps: [step({ index: 1, status: 'done', oid: 'gone', subject: 'feat: pruned' })],
      }),
      { isStepSelectable: () => false }
    )
    const row = screen.getByTestId('rebase-step-1')
    expect(row.className).not.toContain('cursor-pointer')
    await user.click(row)
    expect(onSelectStep).not.toHaveBeenCalled()
  })

  it('marks the paused step as the selected row while the files panel is up', () => {
    renderCenter(rebaseState(), { filesPanelOpen: true })
    expect(screen.getByTestId('rebase-step-2').className).toContain('bg-accent')
    expect(screen.getByTestId('rebase-step-1').className).not.toContain('bg-accent')
  })

  it('explains an empty plan instead of rendering a bare rail', () => {
    renderCenter(rebaseState({ steps: [] }))
    expect(screen.getByTestId('rebase-progress-empty')).toHaveTextContent(
      'Git is not reporting a step list for this rebase.'
    )
    expect(screen.queryByTestId('rebase-step-list')).not.toBeInTheDocument()
  })
})

describe('RebaseProgressCenter — actions', () => {
  it('offers Continue once every conflict is resolved, and no Skip', () => {
    renderCenter()
    expect(screen.getByTestId('rebase-progress-continue')).toBeInTheDocument()
    expect(screen.queryByTestId('rebase-progress-skip')).not.toBeInTheDocument()
  })

  it('offers Skip while files conflict and nothing has been staged', () => {
    useConflictedFiles.mockReturnValue({ data: ['src/a.ts'] })
    renderCenter()
    expect(screen.getByTestId('rebase-progress-skip')).toBeInTheDocument()
    expect(screen.queryByTestId('rebase-progress-continue')).not.toBeInTheDocument()
  })

  // Staged fixes mean the user intends to finish the step, so dropping it would lose their work.
  it('withholds Skip once a resolution has been staged', () => {
    useConflictedFiles.mockReturnValue({ data: ['src/a.ts'] })
    useGitStatus.mockReturnValue({
      data: gitStatus({ staged: [{ path: 'src/b.ts', status: 'modified' }] }),
    })
    renderCenter()
    expect(screen.queryByTestId('rebase-progress-skip')).not.toBeInTheDocument()
  })

  it('offers only Abort while a rebase is mid-apply rather than paused', () => {
    renderCenter(rebaseState({ kind: 'in_progress' }))
    expect(screen.queryByTestId('rebase-progress-continue')).not.toBeInTheDocument()
    expect(screen.queryByTestId('rebase-progress-skip')).not.toBeInTheDocument()
    expect(screen.getByTestId('rebase-progress-abort')).toBeInTheDocument()
  })

  it('continues the rebase without amending the step message', async () => {
    const user = userEvent.setup()
    mockedContinue.mockResolvedValue(undefined)
    renderCenter()
    await user.click(screen.getByTestId('rebase-progress-continue'))
    expect(mockedContinue).toHaveBeenCalledWith('/repo', undefined)
  })

  it('aborts the rebase', async () => {
    const user = userEvent.setup()
    mockedAbort.mockResolvedValue(undefined)
    renderCenter()
    await user.click(screen.getByTestId('rebase-progress-abort'))
    expect(mockedAbort).toHaveBeenCalledWith('/repo')
  })

  it('skips the step', async () => {
    const user = userEvent.setup()
    useConflictedFiles.mockReturnValue({ data: ['src/a.ts'] })
    mockedSkip.mockResolvedValue(undefined)
    renderCenter()
    await user.click(screen.getByTestId('rebase-progress-skip'))
    expect(mockedSkip).toHaveBeenCalledWith('/repo')
  })

  it('surfaces a failed control instead of swallowing it', async () => {
    const user = userEvent.setup()
    mockedContinue.mockRejectedValue(new Error('could not apply'))
    renderCenter()
    await user.click(screen.getByTestId('rebase-progress-continue'))
    await waitFor(() =>
      expect(screen.getByTestId('rebase-progress-error')).toHaveTextContent('could not apply')
    )
  })
})
