import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { MockIssue } from '../app/pull-requests/types'

const { pluginOpen } = vi.hoisted(() => ({ pluginOpen: vi.fn() }))
vi.mock('@tauri-apps/plugin-shell', () => ({ open: pluginOpen }))

vi.mock('../api/git.api', () => ({ apiCreateBranch: vi.fn(), apiCheckoutBranch: vi.fn() }))
vi.mock('../api/github.api', () => ({ setIssueState: vi.fn() }))
vi.mock('@git-manager/ui', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('./useIssueRepoLink', () => ({ useIssueRepoLink: vi.fn() }))

import { apiCreateBranch, apiCheckoutBranch } from '../api/git.api'
import { setIssueState } from '../api/github.api'
import { toast } from '@git-manager/ui'
import { useIssueRepoLink } from './useIssueRepoLink'
import { useSettingsStore } from '../stores/settings.store'
import { useRepoUIStore } from '../stores/repoUI.store'
import { useIssueActions } from './useIssueActions'

const mocked = {
  apiCreateBranch: apiCreateBranch as unknown as ReturnType<typeof vi.fn>,
  apiCheckoutBranch: apiCheckoutBranch as unknown as ReturnType<typeof vi.fn>,
  setIssueState: setIssueState as unknown as ReturnType<typeof vi.fn>,
  useIssueRepoLink: useIssueRepoLink as unknown as ReturnType<typeof vi.fn>,
  toastSuccess: toast.success as unknown as ReturnType<typeof vi.fn>,
  toastError: toast.error as unknown as ReturnType<typeof vi.fn>,
}

const DEFAULT_SETTINGS = useSettingsStore.getState().settings

function issue(overrides: Partial<MockIssue> = {}): MockIssue {
  return {
    id: '1',
    number: 42,
    title: 'Fix the thing',
    repo: 'git-manager',
    fullName: 'owner/git-manager',
    url: 'https://github.com/owner/git-manager/issues/42',
    status: 'open',
    author: 'octocat',
    authorAvatar: '',
    assignees: [],
    labels: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    comments: 0,
    thumbsUp: 0,
    ...overrides,
  }
}

function withToken() {
  useSettingsStore.setState({
    settings: {
      ...DEFAULT_SETTINGS,
      github: {
        accounts: [
          { id: 'acc1', token: 'tok', user: { login: 'me', name: null, email: null, avatarUrl: '' } },
        ],
        activeAccountId: 'acc1',
      },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS })
  useRepoUIStore.setState({ openTabs: [], activeRepo: null, activeTab: 'dashboard' })
  mocked.useIssueRepoLink.mockReturnValue({ repoPath: null, branch: null, refreshBranch: vi.fn() })
  mocked.setIssueState.mockResolvedValue({ number: 42, state: 'closed' })
})

describe('useIssueActions — viewRepo', () => {
  it('opens the local tab when the repo is added', () => {
    mocked.useIssueRepoLink.mockReturnValue({
      repoPath: '/local/git-manager',
      branch: null,
      refreshBranch: vi.fn(),
    })
    const { result } = renderHook(() => useIssueActions(issue()))
    act(() => result.current.viewRepo())
    expect(useRepoUIStore.getState().openTabs).toContain('/local/git-manager')
  })

  it('falls back to the GitHub repo URL when not added locally', () => {
    const { result } = renderHook(() => useIssueActions(issue()))
    act(() => result.current.viewRepo())
    expect(pluginOpen).toHaveBeenCalledWith('https://github.com/owner/git-manager')
  })
})

describe('useIssueActions — createBranch', () => {
  it('creates and checks out a branch, then refreshes', async () => {
    const refreshBranch = vi.fn()
    mocked.useIssueRepoLink.mockReturnValue({ repoPath: '/local/gm', branch: null, refreshBranch })
    const { result } = renderHook(() => useIssueActions(issue()))
    await act(async () => result.current.createBranch())
    expect(mocked.apiCreateBranch).toHaveBeenCalledWith('/local/gm', '42-fix-the-thing', 'HEAD')
    expect(mocked.apiCheckoutBranch).toHaveBeenCalledWith('/local/gm', '42-fix-the-thing')
    expect(refreshBranch).toHaveBeenCalled()
    expect(mocked.toastSuccess).toHaveBeenCalled()
  })

  it('does nothing without a local repo', async () => {
    const { result } = renderHook(() => useIssueActions(issue()))
    await act(async () => result.current.createBranch())
    expect(mocked.apiCreateBranch).not.toHaveBeenCalled()
  })
})

describe('useIssueActions — close', () => {
  it('is disabled without a token', () => {
    const { result } = renderHook(() => useIssueActions(issue()))
    expect(result.current.canClose).toBe(false)
  })

  it('closes the issue via the API and notifies the caller', async () => {
    withToken()
    const onChanged = vi.fn()
    const { result } = renderHook(() => useIssueActions(issue(), onChanged))
    expect(result.current.canClose).toBe(true)
    await act(async () => result.current.close())
    expect(mocked.setIssueState).toHaveBeenCalledWith('owner', 'git-manager', 42, 'closed', 'tok')
    expect(onChanged).toHaveBeenCalled()
    expect(mocked.toastSuccess).toHaveBeenCalled()
  })

  it('surfaces a failure as an error toast', async () => {
    withToken()
    mocked.setIssueState.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useIssueActions(issue()))
    await act(async () => result.current.close())
    expect(mocked.toastError).toHaveBeenCalled()
  })
})
