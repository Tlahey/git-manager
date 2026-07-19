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
  it('binds to the per-repo WIP message and shows the detailed file changes tags', async () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    const user = userEvent.setup()
    render(<WipCommitInput wipStats={{ added: 1, modified: 2, deleted: 0 }} />)
    expect(screen.getByText('+1')).toBeInTheDocument()
    expect(screen.getByText('~2')).toBeInTheDocument()

    await user.type(screen.getByPlaceholderText('// WIP'), 'my wip message')
    expect(useRepoDataStore.getState().wipMessages['/repo']).toBe('my wip message')
  })

  it('commits a non-blank trimmed message on Enter', async () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    useRepoDataStore.setState({ wipMessages: { '/repo': '  do the thing  ' } })
    const onCommit = vi.fn()
    const user = userEvent.setup()
    render(<WipCommitInput wipStats={{ added: 1, modified: 0, deleted: 0 }} onCommit={onCommit} />)
    await user.type(screen.getByPlaceholderText('// WIP'), '{Enter}')
    expect(onCommit).toHaveBeenCalledWith('  do the thing  ')
  })

  it('does not commit on Enter when blank', async () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    const onCommit = vi.fn()
    const user = userEvent.setup()
    render(<WipCommitInput wipStats={{ added: 1, modified: 0, deleted: 0 }} onCommit={onCommit} />)
    await user.type(screen.getByPlaceholderText('// WIP'), '{Enter}')
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('clicking the detailed changes tags bubbles up to a parent row click handler (selects the WIP row)', async () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    const onRowClick = vi.fn()
    const user = userEvent.setup()
    render(
      <div onClick={onRowClick}>
        <WipCommitInput wipStats={{ added: 3, modified: 0, deleted: 0 }} />
      </div>
    )
    await user.click(screen.getByText('+3'))
    expect(onRowClick).toHaveBeenCalledOnce()
  })

  it('clicking the input itself does not bubble up (typing should not fight row selection)', async () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    const onRowClick = vi.fn()
    const user = userEvent.setup()
    render(
      <div onClick={onRowClick}>
        <WipCommitInput wipStats={{ added: 3, modified: 0, deleted: 0 }} />
      </div>
    )
    await user.click(screen.getByPlaceholderText('// WIP'))
    expect(onRowClick).not.toHaveBeenCalled()
  })
})

describe('WorktreeWipRow', () => {
  it('shows the // WIP marker and detailed file counts, without the worktree name', () => {
    render(<WorktreeWipRow wipStats={{ added: 1, modified: 2, deleted: 1 }} />)
    expect(screen.getByText(/\/\/ WIP/)).toBeInTheDocument()
    expect(screen.getByText('+1')).toBeInTheDocument()
    expect(screen.getByText('~2')).toBeInTheDocument()
    expect(screen.getByText('-1')).toBeInTheDocument()
    expect(screen.queryByText(/feature-x/)).not.toBeInTheDocument()
  })

  it('hides the Open Worktree button by default (showOpenButton unset)', () => {
    render(<WorktreeWipRow wipStats={{ added: 1, modified: 0, deleted: 0 }} />)
    expect(screen.queryByRole('button', { name: 'gitTree.wip.openWorktree' })).not.toBeInTheDocument()
  })

  it('shows the Open Worktree button and calls onOpenWorktree on click when showOpenButton is set', async () => {
    const onOpenWorktree = vi.fn()
    const user = userEvent.setup()
    render(<WorktreeWipRow wipStats={{ added: 1, modified: 0, deleted: 0 }} onOpenWorktree={onOpenWorktree} showOpenButton />)
    await user.click(screen.getByRole('button', { name: 'gitTree.wip.openWorktree' }))
    expect(onOpenWorktree).toHaveBeenCalledOnce()
  })

  it('does not render an editable input', () => {
    render(<WorktreeWipRow wipStats={{ added: 0, modified: 0, deleted: 0 }} showOpenButton />)
    expect(screen.queryByPlaceholderText('// WIP')).not.toBeInTheDocument()
  })

  it('clicking the row body selects it (bubbles to the parent row handler) without opening the worktree', async () => {
    const onOpenWorktree = vi.fn()
    const onRowClick = vi.fn()
    const user = userEvent.setup()
    render(
      <div onClick={onRowClick}>
        <WorktreeWipRow wipStats={{ added: 1, modified: 0, deleted: 0 }} onOpenWorktree={onOpenWorktree} />
      </div>
    )
    await user.click(screen.getByText(/\/\/ WIP/))
    expect(onRowClick).toHaveBeenCalledOnce()
    expect(onOpenWorktree).not.toHaveBeenCalled()
  })

  it('does not double-fire onOpenWorktree when the explicit button is clicked (row + button both wired)', async () => {
    const onOpenWorktree = vi.fn()
    const user = userEvent.setup()
    render(<WorktreeWipRow wipStats={{ added: 1, modified: 0, deleted: 0 }} onOpenWorktree={onOpenWorktree} showOpenButton />)
    await user.click(screen.getByRole('button', { name: 'gitTree.wip.openWorktree' }))
    expect(onOpenWorktree).toHaveBeenCalledOnce()
  })

  it('the Open Worktree tag opens the worktree without bubbling to the parent row handler', async () => {
    const onOpenWorktree = vi.fn()
    const onRowClick = vi.fn()
    const user = userEvent.setup()
    render(
      <div onClick={onRowClick}>
        <WorktreeWipRow wipStats={{ added: 1, modified: 0, deleted: 0 }} onOpenWorktree={onOpenWorktree} showOpenButton />
      </div>
    )
    await user.click(screen.getByRole('button', { name: 'gitTree.wip.openWorktree' }))
    expect(onOpenWorktree).toHaveBeenCalledOnce()
    expect(onRowClick).not.toHaveBeenCalled()
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

describe('WipRefTag (via WipCommitInput / WorktreeWipRow)', () => {
  const noStats = { added: 0, modified: 0, deleted: 0 }

  it('renders no tag when no ref info is provided', () => {
    const { container } = render(<WipCommitInput wipStats={noStats} />)
    expect(container.querySelector('[title]')).toBeNull()
  })

  it('renders no tag for an empty ref name', () => {
    const { container } = render(
      <WipCommitInput wipStats={noStats} refInfo={{ name: '', isWorktree: false }} />
    )
    expect(container.querySelector('[title]')).toBeNull()
  })

  it('shows a branch icon and name for a plain branch ref (primary WIP)', () => {
    const { container } = render(
      <WipCommitInput wipStats={noStats} refInfo={{ name: 'feat/xyz', isWorktree: false }} />
    )
    expect(screen.getByText('feat/xyz')).toBeInTheDocument()
    expect(container.querySelector('.lucide-git-branch')).toBeTruthy()
    expect(container.querySelector('.lucide-folder-git2')).toBeNull()
  })

  it('shows the worktree icon (over the branch icon) for a worktree ref', () => {
    const { container } = render(
      <WorktreeWipRow wipStats={noStats} refInfo={{ name: 'feature-x', isWorktree: true }} />
    )
    expect(screen.getByText('feature-x')).toBeInTheDocument()
    expect(container.querySelector('.lucide-folder-git2')).toBeTruthy()
    expect(container.querySelector('.lucide-git-branch')).toBeNull()
  })

  it('crops a name longer than 31 chars and keeps the full name in the title', () => {
    const long = 'feature/really-long-branch-name-that-overflows'
    render(<WipCommitInput wipStats={noStats} refInfo={{ name: long, isWorktree: false }} />)
    const cropped = `${long.slice(0, 31)}…`
    const el = screen.getByText(cropped)
    expect(el).toBeInTheDocument()
    expect(el.closest('[title]')).toHaveAttribute('title', long)
  })

  it('does not crop a name of exactly 31 chars', () => {
    const name = 'a'.repeat(31)
    render(<WipCommitInput wipStats={noStats} refInfo={{ name, isWorktree: false }} />)
    expect(screen.getByText(name)).toBeInTheDocument()
    expect(screen.queryByText(`${name}…`)).toBeNull()
  })
})
