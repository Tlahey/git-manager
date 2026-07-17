import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { GitBranch, GitWorktree } from '@git-manager/git-types'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}))

const { useBranchesMock } = vi.hoisted(() => ({ useBranchesMock: vi.fn() }))
vi.mock('../../hooks/useBranches', () => ({ useBranches: () => useBranchesMock() }))
vi.mock('../../api/worktree.api', () => ({
  apiAddWorktree: vi.fn(),
  apiListWorktrees: vi.fn(),
  apiCountDefaultFileMatches: vi.fn().mockResolvedValue([]),
}))
// Treat the patterns exercised here as matching files, so the 0-file guard on "save as default"
// doesn't disable the button.
vi.mock('../../hooks/useDefaultFileMatchCounts', () => ({
  useDefaultFileMatchCounts: () => ({ '.env*': 3, '.env.local': 3 }),
}))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }))

// The combobox's cmdk + Popover internals are brittle in jsdom and tested separately in
// BranchCombobox.test.tsx — here we swap it for a native <select> to drive the dialog's own logic
// (defaulting, path derivation, in-use warning, create flow).
vi.mock('./BranchCombobox', () => ({
  BranchCombobox: ({
    branches,
    value,
    onChange,
  }: {
    branches: { shortName: string; isCheckedOut: boolean }[]
    value: string
    onChange: (b: string) => void
  }) => (
    <select
      data-testid="worktree-add-branch-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {branches.map((b) => (
        <option key={b.shortName} value={b.shortName}>
          {b.shortName}
          {b.isCheckedOut ? ' (in use)' : ''}
        </option>
      ))}
    </select>
  ),
}))

import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { apiAddWorktree, apiListWorktrees } from '../../api/worktree.api'
import { useSettingsStore } from '../../stores/settings.store'
import { AddWorktreeDialog } from './AddWorktreeDialog'

const mockedAddWorktree = apiAddWorktree as unknown as ReturnType<typeof vi.fn>
const mockedListWorktrees = apiListWorktrees as unknown as ReturnType<typeof vi.fn>
const mockedOpenDialog = openDialog as unknown as ReturnType<typeof vi.fn>

function branch(shortName: string, overrides: Partial<GitBranch> = {}): GitBranch {
  return {
    name: `refs/heads/${shortName}`,
    shortName,
    isHead: false,
    isRemote: false,
    commitOid: 'oid',
    commitMessage: 'msg',
    commitTimestamp: 0,
    aheadCount: 0,
    behindCount: 0,
    ...overrides,
  }
}

function worktree(branchName: string, overrides: Partial<GitWorktree> = {}): GitWorktree {
  return {
    path: `/tmp/${branchName}`,
    branch: branchName,
    commitOid: 'oid',
    isMain: false,
    isLocked: false,
    isDirty: false,
    isPrunable: false,
    ...overrides,
  }
}

function renderDialog(props: Partial<React.ComponentProps<typeof AddWorktreeDialog>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
  const utils = render(
    <QueryClientProvider client={client}>
      <AddWorktreeDialog repoPath="/repo" open onClose={vi.fn()} {...props} />
    </QueryClientProvider>
  )
  return { ...utils, invalidateSpy }
}

beforeEach(() => {
  vi.clearAllMocks()
  // Start every test from a repo with no saved default files.
  useSettingsStore.getState().resetRepoSetting('/repo', 'worktreeDefaultFiles')
  useBranchesMock.mockReturnValue({
    data: [branch('main', { isHead: true }), branch('feature/login'), branch('feature/settings')],
  })
  mockedListWorktrees.mockResolvedValue([
    worktree('main', { path: '/repo', isMain: true }),
    worktree('feature/login', { path: '/tmp/git-manager-fixtures/worktree-repo-linked' }),
  ])
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AddWorktreeDialog — branch picker', () => {
  it('lists every local branch, including ones already checked out', async () => {
    renderDialog()
    await waitFor(() => {
      const select = screen.getByTestId('worktree-add-branch-select')
      const options = Array.from(select.querySelectorAll('option')).map((o) => o.value)
      expect(options).toEqual(['main', 'feature/login', 'feature/settings'])
    })
  })

  it('defaults to the current (HEAD) branch', async () => {
    renderDialog()
    await waitFor(() =>
      expect(screen.getByTestId<HTMLSelectElement>('worktree-add-branch-select')).toHaveValue('main')
    )
  })

  it('warns and blocks creation when the selected branch is already used by a worktree', async () => {
    renderDialog()
    // Default is the current branch (main), which the main worktree already checks out.
    expect(await screen.findByTestId('worktree-add-branch-in-use-warning')).toHaveTextContent(
      'worktree.addBranchCheckedOutWarning'
    )
    await waitFor(() =>
      expect(screen.getByTestId('worktree-add-confirm-button')).toBeDisabled()
    )
  })

  it('shows a message instead of the picker when the repo has no local branches', async () => {
    useBranchesMock.mockReturnValue({ data: [branch('origin/main', { isRemote: true })] })
    renderDialog()
    expect(await screen.findByText('worktree.addNoBranches')).toBeInTheDocument()
    expect(screen.queryByTestId('worktree-add-branch-select')).not.toBeInTheDocument()
  })
})

describe('AddWorktreeDialog — destination path', () => {
  it('derives a sibling <project>.worktrees/<branch> path, preserving slashes', async () => {
    const user = userEvent.setup()
    renderDialog()
    await screen.findByTestId('worktree-add-branch-select')
    // Default (main) → /repo.worktrees/main
    await waitFor(() =>
      expect(screen.getByTestId<HTMLInputElement>('worktree-add-path-input')).toHaveValue(
        '/repo.worktrees/main'
      )
    )
    await user.selectOptions(screen.getByTestId('worktree-add-branch-select'), 'feature/settings')
    await waitFor(() =>
      expect(screen.getByTestId<HTMLInputElement>('worktree-add-path-input')).toHaveValue(
        '/repo.worktrees/feature/settings'
      )
    )
  })

  it('anchors the default path on the MAIN worktree root, not the active (linked) worktree', async () => {
    mockedListWorktrees.mockResolvedValue([
      worktree('main', { path: '/Users/x/git-manager', isMain: true }),
      worktree('feature/login', { path: '/Users/x/git-manager/.linked/login' }),
    ])
    // The dialog is opened from a tab that is itself a linked worktree.
    renderDialog({ repoPath: '/Users/x/git-manager/.linked/login' })
    await screen.findByTestId('worktree-add-branch-select')
    await waitFor(() =>
      expect(screen.getByTestId<HTMLInputElement>('worktree-add-path-input')).toHaveValue(
        '/Users/x/git-manager.worktrees/main'
      )
    )
  })

  it('stops re-deriving the path once the user edits it', async () => {
    const user = userEvent.setup()
    renderDialog()
    await screen.findByTestId('worktree-add-path-input')
    await user.clear(screen.getByTestId('worktree-add-path-input'))
    await user.type(screen.getByTestId('worktree-add-path-input'), '/custom/place')
    await user.selectOptions(screen.getByTestId('worktree-add-branch-select'), 'feature/settings')
    expect(screen.getByTestId<HTMLInputElement>('worktree-add-path-input')).toHaveValue(
      '/custom/place'
    )
  })

  it('appends the branch folder to a directory chosen via the folder picker', async () => {
    mockedOpenDialog.mockResolvedValue('/picked/dir')
    const user = userEvent.setup()
    renderDialog()
    await screen.findByTestId('worktree-add-path-browse')
    await user.selectOptions(screen.getByTestId('worktree-add-branch-select'), 'feature/settings')
    await user.click(screen.getByTestId('worktree-add-path-browse'))
    await waitFor(() =>
      expect(screen.getByTestId<HTMLInputElement>('worktree-add-path-input')).toHaveValue(
        '/picked/dir/feature/settings'
      )
    )
  })
})

describe('AddWorktreeDialog — creating a worktree', () => {
  it('creates the worktree with the selected branch and derived path, invalidates, and closes', async () => {
    mockedAddWorktree.mockResolvedValue({ copied: [], skipped: [] })
    const onClose = vi.fn()
    const user = userEvent.setup()
    const { invalidateSpy } = renderDialog({ onClose })

    await screen.findByTestId('worktree-add-branch-select')
    // main is in use → pick a free branch first.
    await user.selectOptions(screen.getByTestId('worktree-add-branch-select'), 'feature/settings')
    await user.click(screen.getByTestId('worktree-add-confirm-button'))

    // No default files configured → empty list forwarded, and the dialog closes immediately.
    expect(mockedAddWorktree).toHaveBeenCalledWith(
      '/repo',
      'feature/settings',
      '/repo.worktrees/feature/settings',
      []
    )
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['worktrees', '/repo'] })
  })

  it('shows an inline error and stays open when add_worktree fails', async () => {
    mockedAddWorktree.mockRejectedValue(new Error('git worktree add failed'))
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderDialog({ onClose })

    await screen.findByTestId('worktree-add-branch-select')
    await user.selectOptions(screen.getByTestId('worktree-add-branch-select'), 'feature/settings')
    await user.click(screen.getByTestId('worktree-add-confirm-button'))

    expect(await screen.findByText(/git worktree add failed/)).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('cancel calls onClose without creating a worktree', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderDialog({ onClose })
    await screen.findByTestId('worktree-add-branch-select')
    await user.click(screen.getByText('gitTree.contextMenu.cancel'))
    expect(onClose).toHaveBeenCalledOnce()
    expect(mockedAddWorktree).not.toHaveBeenCalled()
  })
})

describe('AddWorktreeDialog — default files panel', () => {
  it('seeds the panel from the repo saved defaults and forwards them, keeping the summary open', async () => {
    useSettingsStore.getState().setRepoSetting('/repo', 'worktreeDefaultFiles', ['.env*'])
    mockedAddWorktree.mockResolvedValue({ copied: ['.env'], skipped: ['missing/*'] })
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderDialog({ onClose })

    // The saved pattern pre-fills a row.
    await waitFor(() =>
      expect(screen.getByTestId<HTMLInputElement>('default-files-input')).toHaveValue('.env*')
    )
    // main is in use → pick a free branch; the destination path derives from it.
    await user.selectOptions(screen.getByTestId('worktree-add-branch-select'), 'feature/settings')
    await user.click(screen.getByTestId('worktree-add-confirm-button'))

    expect(mockedAddWorktree).toHaveBeenCalledWith(
      '/repo',
      'feature/settings',
      '/repo.worktrees/feature/settings',
      ['.env*']
    )
    // With files requested, the dialog stays open to show the copy summary instead of closing.
    expect(await screen.findByTestId('worktree-add-result')).toBeInTheDocument()
    expect(screen.getByTestId('worktree-add-skipped')).toHaveTextContent('missing/*')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('"save as project default" persists the edited list to the repo settings', async () => {
    const user = userEvent.setup()
    renderDialog()
    await screen.findByTestId('worktree-add-branch-select')

    await user.click(screen.getByTestId('default-files-add'))
    await user.type(screen.getByTestId('default-files-input'), '.env.local')
    await user.click(screen.getByTestId('worktree-default-files-save'))

    expect(
      useSettingsStore.getState().settings.repoOverrides['/repo']?.worktreeDefaultFiles
    ).toEqual(['.env.local'])
  })
})
