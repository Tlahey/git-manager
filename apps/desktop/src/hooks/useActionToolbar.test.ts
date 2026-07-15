import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { GitRepo, GitStatus, GitStash } from '@git-manager/git-types'

const invalidateQueries = vi.fn()
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries }) }))

const swrMutate = vi.fn()
vi.mock('swr', () => ({ mutate: (...a: unknown[]) => swrMutate(...a) }))

const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('@git-manager/ui', () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}))

vi.mock('../api/git.api', () => ({
  apiStashPush: vi.fn(),
  apiStashPop: vi.fn(),
  apiFetchRemote: vi.fn(),
  apiPullBranch: vi.fn(),
  apiPushBranch: vi.fn(),
  apiCreateBranch: vi.fn(),
}))
vi.mock('../api/shell.api', () => ({ apiOpenTerminal: vi.fn() }))
vi.mock('../api/repo.api', () => ({ apiOpenInEditor: vi.fn() }))

const useGitStatusMock = vi.fn()
const useGitStashesMock = vi.fn()
vi.mock('./useGitStatus', () => ({ useGitStatus: () => useGitStatusMock() }))
vi.mock('./useGitStashes', () => ({ useGitStashes: () => useGitStashesMock() }))

import {
  apiStashPush,
  apiStashPop,
  apiFetchRemote,
  apiPullBranch,
  apiPushBranch,
  apiCreateBranch,
} from '../api/git.api'
import { apiOpenTerminal } from '../api/shell.api'
import { apiOpenInEditor } from '../api/repo.api'
import { useRepoDataStore } from '../stores/repoData.store'
import { useRepoUIStore } from '../stores/repoUI.store'
import { useUndoHistoryStore } from '../stores/undoHistory.store'
import { useSettingsStore } from '../stores/settings.store'
import { useActionToolbar } from './useActionToolbar'

const mocked = {
  apiStashPush: apiStashPush as unknown as ReturnType<typeof vi.fn>,
  apiStashPop: apiStashPop as unknown as ReturnType<typeof vi.fn>,
  apiFetchRemote: apiFetchRemote as unknown as ReturnType<typeof vi.fn>,
  apiPullBranch: apiPullBranch as unknown as ReturnType<typeof vi.fn>,
  apiPushBranch: apiPushBranch as unknown as ReturnType<typeof vi.fn>,
  apiCreateBranch: apiCreateBranch as unknown as ReturnType<typeof vi.fn>,
  apiOpenTerminal: apiOpenTerminal as unknown as ReturnType<typeof vi.fn>,
  apiOpenInEditor: apiOpenInEditor as unknown as ReturnType<typeof vi.fn>,
}

const DEFAULT_SETTINGS = useSettingsStore.getState().settings
const t = (key: string, opts?: Record<string, unknown>) =>
  opts ? `${key}:${JSON.stringify(opts)}` : key

function repo(overrides: Partial<GitRepo> = {}): GitRepo {
  return {
    path: '/repo',
    name: 'repo',
    head: 'main',
    isDetached: false,
    isDirty: false,
    remotes: [],
    ...overrides,
  }
}

function gitStatus(overrides: Partial<GitStatus> = {}): GitStatus {
  return { staged: [], unstaged: [], untracked: [], conflicted: [], ...overrides } as GitStatus
}

beforeEach(() => {
  vi.clearAllMocks()
  useRepoUIStore.setState({ activeRepo: '/repo' })
  useRepoDataStore.setState({ repoCache: { '/repo': repo() }, wipMessages: {} })
  useUndoHistoryStore.setState({ byRepo: {} })
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS })
  useGitStatusMock.mockReturnValue({ data: undefined })
  useGitStashesMock.mockReturnValue({ data: undefined })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useActionToolbar — derived state', () => {
  it('hasChanges is false with no git status data', () => {
    const { result } = renderHook(() => useActionToolbar(t))
    expect(result.current.hasChanges).toBe(false)
  })

  it('hasChanges is true when there are staged/unstaged/untracked files', () => {
    useGitStatusMock.mockReturnValue({
      data: gitStatus({ staged: [{ path: 'a.ts', status: 'modified' }] }),
    })
    const { result } = renderHook(() => useActionToolbar(t))
    expect(result.current.hasChanges).toBe(true)
  })

  it('hasStashes reflects the stash list', () => {
    useGitStashesMock.mockReturnValue({ data: [{ index: 0 } as GitStash] })
    const { result } = renderHook(() => useActionToolbar(t))
    expect(result.current.hasStashes).toBe(true)
  })

  it('fromRef is "HEAD" for a detached repo, otherwise the repo head', () => {
    useRepoDataStore.setState({
      repoCache: { '/repo': repo({ isDetached: true }) },
      wipMessages: {},
    })
    const { result } = renderHook(() => useActionToolbar(t))
    expect(result.current.fromRef).toBe('HEAD')
  })

  it('fromRef falls back to the branch head when not detached', () => {
    const { result } = renderHook(() => useActionToolbar(t))
    expect(result.current.fromRef).toBe('main')
  })

  it('exposes canUndo/canRedo/undoLabel/redoLabel scoped to the active repo', () => {
    useUndoHistoryStore.setState({
      byRepo: {
        '/repo': { stack: [{ id: 'a', label: { key: 'undoRedo.commit' } } as never], pointer: 1 },
      },
    })
    const { result } = renderHook(() => useActionToolbar(t))
    expect(result.current.canUndo).toBe(true)
    expect(result.current.canRedo).toBe(false)
    expect(result.current.undoLabel).toEqual({ key: 'undoRedo.commit' })
  })
})

describe('useActionToolbar — terminal', () => {
  it('opens the terminal with the configured app, and exposes hasTerminal', async () => {
    useSettingsStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        externalTools: {
          ...DEFAULT_SETTINGS.externalTools!,
          externalTerminalCommand: '/Applications/iTerm.app',
        },
      },
    })
    const { result } = renderHook(() => useActionToolbar(t))
    expect(result.current.hasTerminal).toBe(true)
    await act(async () => result.current.handleOpenTerminal())
    expect(mocked.apiOpenTerminal).toHaveBeenCalledWith('/repo', '/Applications/iTerm.app')
  })

  it('hasTerminal is false and the handler is a no-op when no app is configured', async () => {
    const { result } = renderHook(() => useActionToolbar(t))
    expect(result.current.hasTerminal).toBe(false)
    await act(async () => result.current.handleOpenTerminal())
    expect(mocked.apiOpenTerminal).not.toHaveBeenCalled()
  })

  it('does nothing without an active repo', async () => {
    useSettingsStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        externalTools: {
          ...DEFAULT_SETTINGS.externalTools!,
          externalTerminalCommand: '/Applications/iTerm.app',
        },
      },
    })
    useRepoUIStore.setState({ activeRepo: null })
    const { result } = renderHook(() => useActionToolbar(t))
    await act(async () => result.current.handleOpenTerminal())
    expect(mocked.apiOpenTerminal).not.toHaveBeenCalled()
  })
})

describe('useActionToolbar — editor', () => {
  it('opens the editor with the configured app, and exposes hasEditor', async () => {
    useSettingsStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        git: {
          ...DEFAULT_SETTINGS.git,
          externalEditorCommand: '/Applications/Sublime Text.app',
        },
      },
    })
    const { result } = renderHook(() => useActionToolbar(t))
    expect(result.current.hasEditor).toBe(true)
    await act(async () => result.current.handleOpenEditor())
    expect(mocked.apiOpenInEditor).toHaveBeenCalledWith('/repo', '/Applications/Sublime Text.app')
  })

  it('hasEditor is false and the handler is a no-op when no app is configured', async () => {
    const { result } = renderHook(() => useActionToolbar(t))
    expect(result.current.hasEditor).toBe(false)
    await act(async () => result.current.handleOpenEditor())
    expect(mocked.apiOpenInEditor).not.toHaveBeenCalled()
  })

  it('does nothing without an active repo', async () => {
    useSettingsStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        git: {
          ...DEFAULT_SETTINGS.git,
          externalEditorCommand: '/Applications/Sublime Text.app',
        },
      },
    })
    useRepoUIStore.setState({ activeRepo: null })
    const { result } = renderHook(() => useActionToolbar(t))
    await act(async () => result.current.handleOpenEditor())
    expect(mocked.apiOpenInEditor).not.toHaveBeenCalled()
  })
})

describe('useActionToolbar — fetch/pull/push', () => {
  it('handleFetch fetches, toasts success, clears redo, and invalidates', async () => {
    mocked.apiFetchRemote.mockResolvedValue(undefined)
    const { result } = renderHook(() => useActionToolbar(t))
    await act(async () => result.current.handleFetch())

    expect(mocked.apiFetchRemote).toHaveBeenCalledWith('/repo')
    expect(toastSuccess).toHaveBeenCalledWith('remote.fetchSuccess')
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['branches', '/repo'] })
    expect(swrMutate).toHaveBeenCalledWith(['git-stashes', '/repo'])
    expect(result.current.loading.fetch).toBe(false)
  })

  it('handleFetchAll fetches every remote individually when remotes exist', async () => {
    useRepoDataStore.setState({
      repoCache: { '/repo': repo({ remotes: ['origin', 'upstream'] }) },
      wipMessages: {},
    })
    mocked.apiFetchRemote.mockResolvedValue(undefined)
    const { result } = renderHook(() => useActionToolbar(t))
    await act(async () => result.current.handleFetchAll())

    expect(mocked.apiFetchRemote).toHaveBeenCalledWith('/repo', 'origin')
    expect(mocked.apiFetchRemote).toHaveBeenCalledWith('/repo', 'upstream')
  })

  it('handleFetchAll falls back to a plain fetch when there are no remotes', async () => {
    mocked.apiFetchRemote.mockResolvedValue(undefined)
    const { result } = renderHook(() => useActionToolbar(t))
    await act(async () => result.current.handleFetchAll())
    expect(mocked.apiFetchRemote).toHaveBeenCalledWith('/repo')
  })

  it('handlePull toasts a conflict message when conflicts occur', async () => {
    mocked.apiPullBranch.mockResolvedValue({ conflicts: ['a.ts'], commitsMerged: 0 })
    const { result } = renderHook(() => useActionToolbar(t))
    await act(async () => result.current.handlePull())
    expect(toastError).toHaveBeenCalledWith('remote.conflict:{"count":1}')
  })

  it('handlePull toasts success with the merged commit count otherwise', async () => {
    mocked.apiPullBranch.mockResolvedValue({ conflicts: [], commitsMerged: 3 })
    const { result } = renderHook(() => useActionToolbar(t))
    await act(async () => result.current.handlePull())
    expect(toastSuccess).toHaveBeenCalledWith('remote.pullSuccess:{"commits":3}')
  })

  it('handlePush toasts success', async () => {
    mocked.apiPushBranch.mockResolvedValue(undefined)
    const { result } = renderHook(() => useActionToolbar(t))
    await act(async () => result.current.handlePush())
    expect(toastSuccess).toHaveBeenCalledWith('remote.pushSuccess')
  })

  it('toasts an error and clears the loading flag when an action rejects', async () => {
    mocked.apiFetchRemote.mockRejectedValue(new Error('network down'))
    const { result } = renderHook(() => useActionToolbar(t))
    await act(async () => result.current.handleFetch())
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('network down'))
    expect(result.current.loading.fetch).toBe(false)
  })

  it('runAction is a no-op without an active repo', async () => {
    useRepoUIStore.setState({ activeRepo: null })
    const { result } = renderHook(() => useActionToolbar(t))
    await act(async () => result.current.handleFetch())
    expect(mocked.apiFetchRemote).not.toHaveBeenCalled()
  })
})

describe('useActionToolbar — undo/redo', () => {
  it('handleUndo calls the store and invalidates', async () => {
    const undoSpy = vi.spyOn(useUndoHistoryStore.getState(), 'undo').mockResolvedValue(undefined)
    const { result } = renderHook(() => useActionToolbar(t))
    await act(async () => result.current.handleUndo())
    expect(undoSpy).toHaveBeenCalledWith('/repo')
    expect(invalidateQueries).toHaveBeenCalled()
  })

  it('handleRedo calls the store and invalidates', async () => {
    const redoSpy = vi.spyOn(useUndoHistoryStore.getState(), 'redo').mockResolvedValue(undefined)
    const { result } = renderHook(() => useActionToolbar(t))
    await act(async () => result.current.handleRedo())
    expect(redoSpy).toHaveBeenCalledWith('/repo')
  })
})

describe('useActionToolbar — stash/pop', () => {
  it('handleStash uses the WIP message when present, always including untracked files', async () => {
    useRepoDataStore.setState({
      repoCache: { '/repo': repo() },
      wipMessages: { '/repo': 'my custom wip' },
    })
    mocked.apiStashPush.mockResolvedValue(undefined)
    const { result } = renderHook(() => useActionToolbar(t))
    await act(async () => result.current.handleStash())

    expect(mocked.apiStashPush).toHaveBeenCalledWith('/repo', 'my custom wip', true)
    expect(useRepoDataStore.getState().wipMessages['/repo']).toBe('')
    expect(toastSuccess).toHaveBeenCalledWith('toolbar.stashSuccess')
  })

  it('handleStash defaults to "WIP on <ref>" when there is no WIP message', async () => {
    mocked.apiStashPush.mockResolvedValue(undefined)
    const { result } = renderHook(() => useActionToolbar(t))
    await act(async () => result.current.handleStash())
    expect(mocked.apiStashPush).toHaveBeenCalledWith('/repo', 'WIP on main', true)
  })

  it('handlePop toasts success', async () => {
    mocked.apiStashPop.mockResolvedValue(undefined)
    const { result } = renderHook(() => useActionToolbar(t))
    await act(async () => result.current.handlePop())
    expect(mocked.apiStashPop).toHaveBeenCalledWith('/repo')
    expect(toastSuccess).toHaveBeenCalledWith('toolbar.popSuccess')
  })
})

describe('useActionToolbar — create branch', () => {
  it('creates a branch from fromRef and toasts success', async () => {
    mocked.apiCreateBranch.mockResolvedValue(undefined)
    const { result } = renderHook(() => useActionToolbar(t))
    await act(async () => result.current.handleCreateBranch('feature-x'))
    expect(mocked.apiCreateBranch).toHaveBeenCalledWith('/repo', 'feature-x', 'main')
    expect(toastSuccess).toHaveBeenCalledWith('toolbar.branchCreated:{"name":"feature-x"}')
  })

  it('toasts an error on failure', async () => {
    mocked.apiCreateBranch.mockRejectedValue(new Error('branch exists'))
    const { result } = renderHook(() => useActionToolbar(t))
    await act(async () => result.current.handleCreateBranch('feature-x'))
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('branch exists'))
  })

  it('does nothing without an active repo', async () => {
    useRepoUIStore.setState({ activeRepo: null })
    const { result } = renderHook(() => useActionToolbar(t))
    await act(async () => result.current.handleCreateBranch('feature-x'))
    expect(mocked.apiCreateBranch).not.toHaveBeenCalled()
  })
})
