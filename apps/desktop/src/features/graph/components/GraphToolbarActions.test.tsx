import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../../../components/action-toolbar/FetchButton', () => ({ FetchButton: () => <button>Fetch</button> }))
vi.mock('../../../components/action-toolbar/BranchButton', () => ({ BranchButton: () => <button>Branch</button> }))
vi.mock('../../../components/action-toolbar/ToolsMenu', () => ({ ToolsMenu: () => <div data-testid="tools-menu" /> }))
// TerminalButton is a self-contained split button (integrated panel + external menu) with its own
// test — stub it here so this composition test doesn't depend on its internals.
vi.mock('../../../components/action-toolbar/TerminalButton', () => ({ TerminalButton: () => <div data-testid="terminal-button" /> }))

const useActionToolbarMock = vi.fn()
vi.mock('../../../hooks/useActionToolbar', () => ({ useActionToolbar: () => useActionToolbarMock() }))

import { GraphToolbarActions } from './GraphToolbarActions'
import { useCommitSearchStore } from '../../../stores/commitSearch.store'
import { useRepoUIStore } from '../../../stores/repoUI.store'

const INITIAL_REPO_UI = useRepoUIStore.getState()

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
    aheadCount: 0,
    behindCount: 0,
    canUndo: false,
    canRedo: false,
    undoLabel: null,
    redoLabel: null,
    hasEditor: true,
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
  useCommitSearchStore.setState({ open: false, query: '' })
  useRepoUIStore.setState(INITIAL_REPO_UI, true)
})

describe('GraphToolbarActions', () => {
  it('disables undo/redo/pull/push/stash/pop/editor when there is no active repo', () => {
    useActionToolbarMock.mockReturnValue(hookState({ activeRepo: null }))
    render(<GraphToolbarActions />)
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Pull' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Push' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Stash' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Pop' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Editor' })).toBeDisabled()
  })

  it('enables undo/redo only when canUndo/canRedo are true', () => {
    useActionToolbarMock.mockReturnValue(hookState({ canUndo: true, canRedo: false }))
    render(<GraphToolbarActions />)
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled()
  })

  it('enables stash only when hasChanges is true', () => {
    useActionToolbarMock.mockReturnValue(hookState({ hasChanges: true }))
    render(<GraphToolbarActions />)
    expect(screen.getByRole('button', { name: 'Stash' })).toBeEnabled()
  })

  it('enables pop only when hasStashes is true', () => {
    useActionToolbarMock.mockReturnValue(hookState({ hasStashes: true }))
    render(<GraphToolbarActions />)
    expect(screen.getByRole('button', { name: 'Pop' })).toBeEnabled()
  })

  it('wires the undo/pull/push/pop/editor buttons to their handlers', async () => {
    const user = userEvent.setup()
    const state = hookState({ canUndo: true, hasStashes: true })
    useActionToolbarMock.mockReturnValue(state)
    render(<GraphToolbarActions />)

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(state.handleUndo).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: 'Pull' }))
    expect(state.handlePull).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: 'Push' }))
    expect(state.handlePush).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: 'Pop' }))
    expect(state.handlePop).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: 'Editor' }))
    expect(state.handleOpenEditor).toHaveBeenCalledOnce()
  })

  it('shows ahead/behind badges on the push/pull buttons when the branch has unpushed/unpulled commits', () => {
    useActionToolbarMock.mockReturnValue(hookState({ aheadCount: 3, behindCount: 2 }))
    render(<GraphToolbarActions />)
    // By test id, not by accessible name: Push now has a caret beside it whose label ("Push
    // options") matches /Push/ too.
    expect(screen.getByTestId('toolbar-push-button')).toHaveTextContent('3')
    expect(screen.getByRole('button', { name: /Pull/ })).toHaveTextContent('2')
    expect(screen.getAllByTestId('toolbar-button-badge')).toHaveLength(2)
  })

  it('shows no push/pull badges when the branch is in sync', () => {
    render(<GraphToolbarActions />)
    expect(screen.queryByTestId('toolbar-button-badge')).not.toBeInTheDocument()
  })

  it('always renders the terminal button (the integrated terminal needs no configured app)', () => {
    useActionToolbarMock.mockReturnValue(hookState({ hasEditor: false }))
    render(<GraphToolbarActions />)
    expect(screen.getByTestId('terminal-button')).toBeInTheDocument()
  })

  it('hides the editor button entirely when no editor app is configured', () => {
    useActionToolbarMock.mockReturnValue(hookState({ hasEditor: false }))
    render(<GraphToolbarActions />)
    expect(screen.queryByRole('button', { name: 'Editor' })).not.toBeInTheDocument()
    expect(screen.getByTestId('terminal-button')).toBeInTheDocument()
  })

  it('shows a loading spinner (no icon) on a button while its action is in flight', () => {
    useActionToolbarMock.mockReturnValue(
      hookState({ hasChanges: true, loading: { ...hookState().loading, stash: true } })
    )
    render(<GraphToolbarActions />)
    expect(screen.getByRole('button', { name: 'Stash' })).toBeDisabled()
  })
})

describe('GraphToolbarActions — commit search', () => {
  it('disables the search button when there is no active repo', () => {
    useActionToolbarMock.mockReturnValue(hookState({ activeRepo: null }))
    render(<GraphToolbarActions />)
    expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled()
  })

  it('disables the search button outside the commits view (e.g. a PR is open)', () => {
    useRepoUIStore.setState({ activePrNumber: 42 })
    render(<GraphToolbarActions />)
    expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled()
  })

  it('re-enables the search button once back on the commits view', () => {
    useRepoUIStore.setState({ activePrNumber: null })
    render(<GraphToolbarActions />)
    expect(screen.getByRole('button', { name: 'Search' })).toBeEnabled()
  })

  it('toggles the commit search panel when the search button is clicked', async () => {
    const user = userEvent.setup()
    render(<GraphToolbarActions />)
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(useCommitSearchStore.getState().open).toBe(true)
  })
})
