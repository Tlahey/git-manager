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

import { apiAddWorktree, apiListWorktrees } from '../../api/worktree.api'
import { useSettingsStore } from '../../stores/settings.store'
import { AddWorktreeDialog } from './AddWorktreeDialog'

const mockedAddWorktree = apiAddWorktree as unknown as ReturnType<typeof vi.fn>
const mockedListWorktrees = apiListWorktrees as unknown as ReturnType<typeof vi.fn>

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
  it('excludes branches already checked out in any worktree (including the main one)', async () => {
    renderDialog()
    // The branches query commonly resolves before the worktrees query does, so the select's
    // options start out unfiltered — wait for the filtered, final state rather than the element's
    // mere existence.
    await waitFor(() => {
      const select = screen.getByTestId('worktree-add-branch-select')
      const options = Array.from(select.querySelectorAll('option')).map((o) => o.value)
      expect(options).toEqual(['feature/settings'])
    })
  })

  it('defaults to the first available (not-checked-out) branch, not HEAD', async () => {
    renderDialog()
    await waitFor(() =>
      expect(screen.getByTestId<HTMLSelectElement>('worktree-add-branch-select')).toHaveValue(
        'feature/settings'
      )
    )
  })

  it('shows a message instead of the picker when every local branch is already checked out', async () => {
    mockedListWorktrees.mockResolvedValue([
      worktree('main', { path: '/repo', isMain: true }),
      worktree('feature/login', { path: '/tmp/a' }),
      worktree('feature/settings', { path: '/tmp/b' }),
    ])
    renderDialog()
    expect(await screen.findByText('worktree.addNoBranches')).toBeInTheDocument()
    expect(screen.queryByTestId('worktree-add-branch-select')).not.toBeInTheDocument()
  })
})

describe('AddWorktreeDialog — creating a worktree', () => {
  it('creates the worktree with the selected branch and path, invalidates, and closes', async () => {
    mockedAddWorktree.mockResolvedValue({ copied: [], skipped: [] })
    const onClose = vi.fn()
    const user = userEvent.setup()
    const { invalidateSpy } = renderDialog({ onClose })

    await waitFor(() =>
      expect(screen.getByTestId<HTMLSelectElement>('worktree-add-branch-select')).toHaveValue(
        'feature/settings'
      )
    )
    await user.type(screen.getByTestId('worktree-add-path-input'), '/tmp/new-wt')
    await user.click(screen.getByTestId('worktree-add-confirm-button'))

    // No default files configured → empty list forwarded, and the dialog closes immediately.
    expect(mockedAddWorktree).toHaveBeenCalledWith('/repo', 'feature/settings', '/tmp/new-wt', [])
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['worktrees', '/repo'] })
  })

  it('shows an inline error and stays open when add_worktree fails', async () => {
    mockedAddWorktree.mockRejectedValue(new Error('git worktree add failed'))
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderDialog({ onClose })

    await screen.findByTestId('worktree-add-branch-select')
    await user.type(screen.getByTestId('worktree-add-path-input'), '/tmp/new-wt')
    await user.click(screen.getByTestId('worktree-add-confirm-button'))

    expect(await screen.findByText(/git worktree add failed/)).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('disables confirm until a path is entered', async () => {
    renderDialog()
    await screen.findByTestId('worktree-add-branch-select')
    expect(screen.getByTestId('worktree-add-confirm-button')).toBeDisabled()
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
    await user.type(screen.getByTestId('worktree-add-path-input'), '/tmp/new-wt')
    await user.click(screen.getByTestId('worktree-add-confirm-button'))

    expect(mockedAddWorktree).toHaveBeenCalledWith('/repo', 'feature/settings', '/tmp/new-wt', [
      '.env*',
    ])
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
