import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('./RepoSelector', () => ({ RepoSelector: () => <div data-testid="repo-selector" /> }))
vi.mock('./BranchContext', () => ({ BranchContext: () => <div data-testid="branch-context" /> }))
vi.mock('./StateTags', () => ({ StateTags: () => <div data-testid="state-tags" /> }))
// The merge-target indicator runs its own react-query/SWR fetches and has its own test; stub it
// so this composition test stays free of a QueryClientProvider.
vi.mock('./MergeTargetIndicator', () => ({
  MergeTargetIndicator: ({ repoPath }: { repoPath: string | null }) => (
    <div data-testid="merge-target-indicator-stub" data-repo-path={repoPath ?? ''} />
  ),
}))
// Each view's section has its own test — this file is about *which* one the shell mounts, and about
// the two controls that are on the bar whatever the view.
vi.mock('./GraphToolbarActions', () => ({
  GraphToolbarActions: () => <div data-testid="graph-toolbar-actions" />,
}))
vi.mock('../../features/files', () => ({
  FilesToolbar: () => <div data-testid="files-toolbar" />,
}))
vi.mock('../../features/board', () => ({
  BoardToolbar: (props: { repoPath: string }) => (
    <div data-testid="board-toolbar">{props.repoPath}</div>
  ),
}))

import { ActionToolbar } from './ActionToolbar'
import { useCommandPaletteStore } from '../../stores/commandPalette.store'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { useRepoViewStore } from '../../stores/repoView.store'

const INITIAL_REPO_UI = useRepoUIStore.getState()

beforeEach(() => {
  vi.clearAllMocks()
  useCommandPaletteStore.setState({ open: false })
  useRepoUIStore.setState(INITIAL_REPO_UI, true)
  useRepoUIStore.setState({ activeRepo: '/repo' })
  useRepoViewStore.setState({ view: 'graph' })
})

describe('ActionToolbar — the parts every view keeps', () => {
  it('renders the repo/branch context children', () => {
    render(<ActionToolbar />)
    expect(screen.getByTestId('repo-selector')).toBeInTheDocument()
    expect(screen.getByTestId('branch-context')).toBeInTheDocument()
    expect(screen.getByTestId('state-tags')).toBeInTheDocument()
  })

  it('points the merge-target indicator at the repo, or at the viewed workspace when there is one', () => {
    const { rerender } = render(<ActionToolbar />)
    expect(screen.getByTestId('merge-target-indicator-stub')).toHaveAttribute(
      'data-repo-path',
      '/repo'
    )

    useRepoUIStore.setState({ activeWorkspacePath: '/repo/../wt' })
    rerender(<ActionToolbar />)
    expect(screen.getByTestId('merge-target-indicator-stub')).toHaveAttribute(
      'data-repo-path',
      '/repo/../wt'
    )
  })

  it('never disables the actions button, even with no active repo', () => {
    useRepoUIStore.setState({ activeRepo: null })
    render(<ActionToolbar />)
    expect(screen.getByRole('button', { name: 'Actions' })).toBeEnabled()
  })

  it('toggles the command palette when the actions button is clicked', async () => {
    const user = userEvent.setup()
    render(<ActionToolbar />)
    await user.click(screen.getByRole('button', { name: 'Actions' }))
    expect(useCommandPaletteStore.getState().open).toBe(true)
  })
})

/**
 * The point of the split: exactly one view's actions are on the bar at a time, so a command the
 * current view cannot answer for is not merely disabled — it is not there to click.
 */
describe('ActionToolbar — one section per view', () => {
  it('mounts the graph actions on the graph view, and nobody else’s', () => {
    render(<ActionToolbar />)
    expect(screen.getByTestId('graph-toolbar-actions')).toBeInTheDocument()
    expect(screen.queryByTestId('files-toolbar')).not.toBeInTheDocument()
    expect(screen.queryByTestId('board-toolbar')).not.toBeInTheDocument()
  })

  it('mounts the files actions on the files view', () => {
    useRepoViewStore.setState({ view: 'files' })
    render(<ActionToolbar />)
    expect(screen.getByTestId('files-toolbar')).toBeInTheDocument()
    expect(screen.queryByTestId('graph-toolbar-actions')).not.toBeInTheDocument()
  })

  it('mounts the board actions on the board view, pointed at the viewed path', () => {
    useRepoViewStore.setState({ view: 'board' })
    useRepoUIStore.setState({ activeWorkspacePath: '/repo/wt' })
    render(<ActionToolbar />)
    expect(screen.getByTestId('board-toolbar')).toHaveTextContent('/repo/wt')
    expect(screen.queryByTestId('graph-toolbar-actions')).not.toBeInTheDocument()
  })
})
