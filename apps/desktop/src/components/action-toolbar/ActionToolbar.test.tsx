import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('./RepoSelector', () => ({ RepoSelector: () => <div data-testid="repo-selector" /> }))
vi.mock('./BranchContext', () => ({ BranchContext: () => <div data-testid="branch-context" /> }))
vi.mock('./StateTags', () => ({ StateTags: () => <div data-testid="state-tags" /> }))
vi.mock('./FetchButton', () => ({ FetchButton: () => <button>remote.fetch</button> }))
vi.mock('./BranchButton', () => ({ BranchButton: () => <button>toolbar.branch</button> }))

const useActionToolbarMock = vi.fn()
vi.mock('../../hooks/useActionToolbar', () => ({ useActionToolbar: () => useActionToolbarMock() }))

import { ActionToolbar } from './ActionToolbar'

function hookState(overrides: Partial<ReturnType<typeof useActionToolbarMock>> = {}) {
  return {
    activeRepo: '/repo',
    fromRef: 'main',
    loading: {
      fetch: false,
      pull: false,
      push: false,
      stash: false,
      pop: false,
      undo: false,
      redo: false,
    },
    hasChanges: false,
    hasStashes: false,
    canUndo: false,
    canRedo: false,
    undoLabel: null,
    redoLabel: null,
    hasTerminal: true,
    hasEditor: true,
    handleOpenTerminal: vi.fn(),
    handleOpenEditor: vi.fn(),
    handleFetch: vi.fn(),
    handleFetchAll: vi.fn(),
    handlePull: vi.fn(),
    handlePush: vi.fn(),
    handleUndo: vi.fn(),
    handleRedo: vi.fn(),
    handleStash: vi.fn(),
    handlePop: vi.fn(),
    handleCreateBranch: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useActionToolbarMock.mockReturnValue(hookState())
})

describe('ActionToolbar — composition', () => {
  it('renders the repo/branch context children', () => {
    render(<ActionToolbar searchQuery="" onSearchChange={vi.fn()} />)
    expect(screen.getByTestId('repo-selector')).toBeInTheDocument()
    expect(screen.getByTestId('branch-context')).toBeInTheDocument()
    expect(screen.getByTestId('state-tags')).toBeInTheDocument()
  })

  it('disables undo/redo/pull/push/stash/pop/terminal/editor when there is no active repo', () => {
    useActionToolbarMock.mockReturnValue(hookState({ activeRepo: null }))
    render(<ActionToolbar searchQuery="" onSearchChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'toolbar.undo' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'toolbar.redo' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'remote.pull' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'remote.push' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'toolbar.stash' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'toolbar.pop' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'toolbar.terminal' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'toolbar.editor' })).toBeDisabled()
  })

  it('enables undo/redo only when canUndo/canRedo are true', () => {
    useActionToolbarMock.mockReturnValue(hookState({ canUndo: true, canRedo: false }))
    render(<ActionToolbar searchQuery="" onSearchChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'toolbar.undo' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'toolbar.redo' })).toBeDisabled()
  })

  it('enables stash only when hasChanges is true', () => {
    useActionToolbarMock.mockReturnValue(hookState({ hasChanges: true }))
    render(<ActionToolbar searchQuery="" onSearchChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'toolbar.stash' })).toBeEnabled()
  })

  it('enables pop only when hasStashes is true', () => {
    useActionToolbarMock.mockReturnValue(hookState({ hasStashes: true }))
    render(<ActionToolbar searchQuery="" onSearchChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'toolbar.pop' })).toBeEnabled()
  })

  it('wires the undo/pull/push/pop/terminal/editor buttons to their handlers', async () => {
    const user = userEvent.setup()
    const state = hookState({ canUndo: true, hasStashes: true })
    useActionToolbarMock.mockReturnValue(state)
    render(<ActionToolbar searchQuery="" onSearchChange={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'toolbar.undo' }))
    expect(state.handleUndo).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: 'remote.pull' }))
    expect(state.handlePull).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: 'remote.push' }))
    expect(state.handlePush).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: 'toolbar.pop' }))
    expect(state.handlePop).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: 'toolbar.terminal' }))
    expect(state.handleOpenTerminal).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: 'toolbar.editor' }))
    expect(state.handleOpenEditor).toHaveBeenCalledOnce()
  })

  it('hides the terminal button entirely when no terminal app is configured', () => {
    useActionToolbarMock.mockReturnValue(hookState({ hasTerminal: false }))
    render(<ActionToolbar searchQuery="" onSearchChange={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'toolbar.terminal' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'toolbar.editor' })).toBeInTheDocument()
  })

  it('hides the editor button entirely when no editor app is configured', () => {
    useActionToolbarMock.mockReturnValue(hookState({ hasEditor: false }))
    render(<ActionToolbar searchQuery="" onSearchChange={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'toolbar.editor' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'toolbar.terminal' })).toBeInTheDocument()
  })

  it('hides both terminal and editor buttons when neither app is configured', () => {
    useActionToolbarMock.mockReturnValue(hookState({ hasTerminal: false, hasEditor: false }))
    render(<ActionToolbar searchQuery="" onSearchChange={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'toolbar.terminal' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'toolbar.editor' })).not.toBeInTheDocument()
  })

  it('shows a loading spinner (no icon) on a button while its action is in flight', () => {
    useActionToolbarMock.mockReturnValue(
      hookState({ hasChanges: true, loading: { ...hookState().loading, stash: true } })
    )
    render(<ActionToolbar searchQuery="" onSearchChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'toolbar.stash' })).toBeDisabled()
  })

  it('passes the search value through and forwards changes', async () => {
    const user = userEvent.setup()
    const onSearchChange = vi.fn()
    render(<ActionToolbar searchQuery="feat" onSearchChange={onSearchChange} />)
    const input = screen.getByPlaceholderText('toolbar.search') as HTMLInputElement
    expect(input.value).toBe('feat')
    await user.type(input, 'x')
    expect(onSearchChange).toHaveBeenCalled()
  })
})
