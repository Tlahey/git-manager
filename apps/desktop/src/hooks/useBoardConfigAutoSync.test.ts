import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useBoardConfigAutoSync } from './useBoardConfigAutoSync'
import { useSettingsStore } from '../stores/settings.store'

const { apiGetRepoStatus, apiStageFile, apiCreateCommit, apiPushBranch, apiGetBranches } = vi.hoisted(
  () => ({
    apiGetRepoStatus: vi.fn(),
    apiStageFile: vi.fn(),
    apiCreateCommit: vi.fn(),
    apiPushBranch: vi.fn(),
    apiGetBranches: vi.fn(),
  })
)

vi.mock('../api/git.api', () => ({
  apiGetRepoStatus,
  apiStageFile,
  apiCreateCommit,
  apiPushBranch,
  apiGetBranches,
}))

const INITIAL_SETTINGS = useSettingsStore.getState()
const path = '/repo'

function emptyStatus() {
  return { staged: [], unstaged: [], untracked: [], conflicted: [] }
}

function setAutoSync(enabled: boolean, intervalMinutes = 5) {
  useSettingsStore.setState({
    settings: {
      ...useSettingsStore.getState().settings,
      board: { autoSync: { enabled, intervalMinutes } },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  useSettingsStore.setState(INITIAL_SETTINGS, true)
  apiGetRepoStatus.mockResolvedValue(emptyStatus())
  apiGetBranches.mockResolvedValue([])
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useBoardConfigAutoSync', () => {
  it('does nothing when disabled', async () => {
    setAutoSync(false)
    renderHook(() => useBoardConfigAutoSync(path))
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(apiGetRepoStatus).not.toHaveBeenCalled()
  })

  it('does nothing without a repo path', async () => {
    setAutoSync(true)
    renderHook(() => useBoardConfigAutoSync(null))
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(apiGetRepoStatus).not.toHaveBeenCalled()
  })

  it('checks status on the configured interval but does not commit when clean', async () => {
    setAutoSync(true, 5)
    renderHook(() => useBoardConfigAutoSync(path))

    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(apiGetRepoStatus).toHaveBeenCalledWith(path)
    expect(apiStageFile).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(apiGetRepoStatus).toHaveBeenCalledTimes(2)
  })

  it('stages and commits the board config when it is untracked', async () => {
    setAutoSync(true, 1)
    apiGetRepoStatus.mockResolvedValue({
      staged: [],
      unstaged: [],
      untracked: ['.git-manager/board.json'],
      conflicted: [],
    })
    renderHook(() => useBoardConfigAutoSync(path))

    await vi.advanceTimersByTimeAsync(60_000)

    expect(apiStageFile).toHaveBeenCalledWith(path, '.git-manager/board.json')
    expect(apiCreateCommit).toHaveBeenCalledWith(path, 'chore(board): sync board config')
  })

  it('pushes only when the current branch has an upstream', async () => {
    setAutoSync(true, 1)
    apiGetRepoStatus.mockResolvedValue({
      staged: [{ path: '.git-manager/board.json', status: 'modified' }],
      unstaged: [],
      untracked: [],
      conflicted: [],
    })
    apiGetBranches.mockResolvedValue([
      { name: 'main', isHead: true, upstream: 'origin/main' },
      { name: 'other', isHead: false, upstream: undefined },
    ])
    renderHook(() => useBoardConfigAutoSync(path))

    await vi.advanceTimersByTimeAsync(60_000)

    expect(apiPushBranch).toHaveBeenCalledWith(path)
  })

  it('does not push when the current branch has no upstream', async () => {
    setAutoSync(true, 1)
    apiGetRepoStatus.mockResolvedValue({
      staged: [{ path: '.git-manager/board.json', status: 'modified' }],
      unstaged: [],
      untracked: [],
      conflicted: [],
    })
    apiGetBranches.mockResolvedValue([{ name: 'main', isHead: true, upstream: undefined }])
    renderHook(() => useBoardConfigAutoSync(path))

    await vi.advanceTimersByTimeAsync(60_000)

    expect(apiCreateCommit).toHaveBeenCalled()
    expect(apiPushBranch).not.toHaveBeenCalled()
  })

  it('swallows a failure instead of throwing', async () => {
    setAutoSync(true, 1)
    apiGetRepoStatus.mockRejectedValue(new Error('boom'))
    renderHook(() => useBoardConfigAutoSync(path))

    // A rejection here would fail the test on its own (unhandled promise rejection); reaching this
    // point at all is the proof the error was caught.
    await vi.advanceTimersByTimeAsync(60_000)
    expect(apiCreateCommit).not.toHaveBeenCalled()
  })
})
