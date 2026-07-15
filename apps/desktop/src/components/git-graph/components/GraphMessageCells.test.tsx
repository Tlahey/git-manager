import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WipCommitInput, WorktreeWipRow, ConflictRowMessage } from './GraphMessageCells'
import { useRepoDataStore } from '../../../stores/repoData.store'
import { useRepoUIStore } from '../../../stores/repoUI.store'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}))

const INITIAL_REPO_DATA = useRepoDataStore.getState()
const INITIAL_REPO_UI = useRepoUIStore.getState()

beforeEach(() => {
  useRepoDataStore.setState(INITIAL_REPO_DATA, true)
  useRepoUIStore.setState(INITIAL_REPO_UI, true)
})

describe('WipCommitInput', () => {
  it('binds to the per-repo WIP message and shows the total-changes count', async () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    const user = userEvent.setup()
    render(<WipCommitInput totalChanges={3} />)
    expect(screen.getByText('3')).toBeInTheDocument()

    await user.type(screen.getByPlaceholderText('// WIP'), 'my wip message')
    expect(useRepoDataStore.getState().wipMessages['/repo']).toBe('my wip message')
  })

  it('commits a non-blank trimmed message on Enter', async () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    useRepoDataStore.setState({ wipMessages: { '/repo': '  do the thing  ' } })
    const onCommit = vi.fn()
    const user = userEvent.setup()
    render(<WipCommitInput totalChanges={0} onCommit={onCommit} />)
    await user.type(screen.getByPlaceholderText('// WIP'), '{Enter}')
    expect(onCommit).toHaveBeenCalledWith('  do the thing  ')
  })

  it('does not commit on Enter when blank', async () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    const onCommit = vi.fn()
    const user = userEvent.setup()
    render(<WipCommitInput totalChanges={0} onCommit={onCommit} />)
    await user.type(screen.getByPlaceholderText('// WIP'), '{Enter}')
    expect(onCommit).not.toHaveBeenCalled()
  })
})

describe('WorktreeWipRow', () => {
  it('shows the branch name and file count', () => {
    render(<WorktreeWipRow branch="feature-x" totalChanges={4} />)
    expect(screen.getByText(/feature-x/)).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('hides the Open Worktree button by default (showOpenButton unset)', () => {
    render(<WorktreeWipRow branch="feature-x" totalChanges={4} />)
    expect(screen.queryByRole('button', { name: 'gitTree.wip.openWorktree' })).not.toBeInTheDocument()
  })

  it('shows the Open Worktree button and calls onOpenWorktree on click when showOpenButton is set', async () => {
    const onOpenWorktree = vi.fn()
    const user = userEvent.setup()
    render(
      <WorktreeWipRow
        branch="feature-x"
        totalChanges={4}
        onOpenWorktree={onOpenWorktree}
        showOpenButton
      />
    )
    await user.click(screen.getByRole('button', { name: 'gitTree.wip.openWorktree' }))
    expect(onOpenWorktree).toHaveBeenCalledOnce()
  })

  it('does not render an editable input', () => {
    render(<WorktreeWipRow branch="feature-x" totalChanges={0} showOpenButton />)
    expect(screen.queryByPlaceholderText('// WIP')).not.toBeInTheDocument()
  })
})

describe('ConflictRowMessage', () => {
  it('shows the translated banner with count/branch', () => {
    render(<ConflictRowMessage count={2} branchName="feature-x" />)
    expect(
      screen.getByText('gitTree.contextMenu.conflictBannerMessage:{"count":2,"branch":"feature-x"}')
    ).toBeInTheDocument()
  })
})
