import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'

vi.mock('../lib/tauri', async () => {
  const actual = await vi.importActual<typeof import('../lib/tauri')>('../lib/tauri')
  return {
    ...actual,
    stageFile: vi.fn(),
    unstageFile: vi.fn(),
    stageAll: vi.fn(),
    unstageAll: vi.fn(),
    autosquashPreview: vi.fn(),
    getPendingFixups: vi.fn(),
    getCommitsBetween: vi.fn(),
    createPatch: vi.fn(),
    createWorkingPatch: vi.fn(),
    previewWorkingPatch: vi.fn(),
    readPatchFile: vi.fn(),
    applyPatch: vi.fn(),
    listPatchableDependencies: vi.fn(),
    prepareDependencyPatch: vi.fn(),
    commitDependencyPatch: vi.fn(),
    editStashMessage: vi.fn(),
    stashList: vi.fn(),
    getRemotes: vi.fn(),
    getCommitWebUrl: vi.fn(),
    getRepoStatus: vi.fn(),
    getLog: vi.fn(),
    getBranches: vi.fn(),
    getCommitDiff: vi.fn(),
    getCommitsMergedDiff: vi.fn(),
    compareCommitToWorkdir: vi.fn(),
    compareRefs: vi.fn(),
    getFileDiff: vi.fn(),
    getFileRawContents: vi.fn(),
    getCommitFileVsWorkdir: vi.fn(),
    getTags: vi.fn(),
    listSubmodules: vi.fn(),
    getRebaseState: vi.fn(),
    listRebaseCommits: vi.fn(),
    fetchRemote: vi.fn(),
    pullBranch: vi.fn(),
    pushBranch: vi.fn(),
  }
})

import * as tauri from '../lib/tauri'
import * as api from './git.api'
import { appEventBus, type AppEventListener } from '../lib/appEventBus'
import { remoteOperationKey, useRemoteProgressStore } from '../stores/remoteProgress.store'

/** An `Error` shaped like `toReadableError` produces for an `AppError::HookFailed` payload. */
function hookFailedError(detail: string): Error {
  const error = new Error('The pre-push hook stopped the operation') as Error & {
    code?: string
    detail?: string
  }
  error.code = 'HOOK_FAILED'
  error.detail = detail
  return error
}

const mocked = tauri as unknown as Record<string, ReturnType<typeof vi.fn>>
const PATH = '/repo/a'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('apiCopyCommitSha', () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
  })

  it('copies the given oid to the clipboard', async () => {
    await api.apiCopyCommitSha('abc123')
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('abc123')
  })
})

describe('stage/unstage — appEventBus interoperability', () => {
  let listener: Mock<AppEventListener>
  let unsubscribe: () => void

  beforeEach(() => {
    listener = vi.fn<AppEventListener>()
    unsubscribe = appEventBus.subscribe(listener)
    mocked.stageFile.mockResolvedValue(undefined)
    mocked.unstageFile.mockResolvedValue(undefined)
    mocked.stageAll.mockResolvedValue(undefined)
    mocked.unstageAll.mockResolvedValue(undefined)
  })

  afterEach(() => unsubscribe())

  it('apiStageFile calls the backend and notifies "stage" with the file path', async () => {
    await api.apiStageFile(PATH, 'a.ts')
    expect(mocked.stageFile).toHaveBeenCalledWith(PATH, 'a.ts')
    expect(listener).toHaveBeenCalledWith('stage', { filePath: 'a.ts' })
  })

  it('apiUnstageFile calls the backend and notifies "unstage" with the file path', async () => {
    await api.apiUnstageFile(PATH, 'a.ts')
    expect(mocked.unstageFile).toHaveBeenCalledWith(PATH, 'a.ts')
    expect(listener).toHaveBeenCalledWith('unstage', { filePath: 'a.ts' })
  })

  it('apiStageAll notifies "stage" with a synthetic "all" file path', async () => {
    await api.apiStageAll(PATH)
    expect(mocked.stageAll).toHaveBeenCalledWith(PATH)
    expect(listener).toHaveBeenCalledWith('stage', { filePath: 'all' })
  })

  it('apiUnstageAll notifies "unstage" with a synthetic "all" file path', async () => {
    await api.apiUnstageAll(PATH)
    expect(listener).toHaveBeenCalledWith('unstage', { filePath: 'all' })
  })

  it('does not notify when the backend call rejects', async () => {
    mocked.stageFile.mockRejectedValue(new Error('boom'))
    await expect(api.apiStageFile(PATH, 'a.ts')).rejects.toThrow(Error)
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('read-only pass-throughs', () => {
  it.each([
    ['apiAutosquashPreview', 'autosquashPreview', [PATH]],
    ['apiGetPendingFixups', 'getPendingFixups', [PATH]],
    ['apiGetCommitsBetween', 'getCommitsBetween', [PATH, 'from', 'to']],
    ['apiCreatePatch', 'createPatch', [PATH, 'oid1', '/tmp/out.patch']],
    ['apiCreateWorkingPatch', 'createWorkingPatch', [PATH, ['a.ts'], '/tmp/out.patch']],
    ['apiPreviewWorkingPatch', 'previewWorkingPatch', [PATH, ['a.ts']]],
    ['apiReadPatchFile', 'readPatchFile', ['/tmp/x.patch']],
    ['apiApplyPatch', 'applyPatch', [PATH, '/tmp/x.patch', true]],
    ['apiListPatchableDependencies', 'listPatchableDependencies', [PATH]],
    ['apiPrepareDependencyPatch', 'prepareDependencyPatch', [PATH, 'left-pad', '1.3.0']],
    ['apiCommitDependencyPatch', 'commitDependencyPatch', [PATH, '/tmp/edit']],
    ['apiStashList', 'stashList', [PATH]],
    ['apiGetRemotes', 'getRemotes', [PATH]],
    ['apiGetCommitWebUrl', 'getCommitWebUrl', [PATH, 'oid1', 'origin']],
    ['apiGetRepoStatus', 'getRepoStatus', [PATH]],
    ['apiGetBranches', 'getBranches', [PATH, true]],
    // `parentIndex` is explicit here: only a merge commit has a second parent, and the graph's
    // "compare against parent N" entries are what pass one.
    ['apiGetCommitDiff', 'getCommitDiff', [PATH, 'oid1', 1]],
    ['apiGetCommitsMergedDiff', 'getCommitsMergedDiff', [PATH, 'base1', 'head1']],
    ['apiCompareCommitToWorkdir', 'compareCommitToWorkdir', [PATH, 'oid1']],
    ['apiCompareRefs', 'compareRefs', [PATH, 'main', 'feature']],
    ['apiGetFileDiff', 'getFileDiff', [PATH, 'a.ts', true, 'oid1', 'base1']],
    ['apiGetFileRawContents', 'getFileRawContents', [PATH, 'a.ts', false, undefined, undefined]],
    ['apiGetCommitFileVsWorkdir', 'getCommitFileVsWorkdir', [PATH, 'oid1', 'a.ts']],
    ['apiGetTags', 'getTags', [PATH]],
    ['apiListSubmodules', 'listSubmodules', [PATH]],
    ['apiGetRebaseState', 'getRebaseState', [PATH]],
    ['apiListRebaseCommits', 'listRebaseCommits', [PATH, 'baseOid']],
    ['apiFetchRemote', 'fetchRemote', [PATH, 'origin', true]],
    ['apiPullBranch', 'pullBranch', [PATH, 'origin', true]],
    ['apiPushBranch', 'pushBranch', [PATH, 'origin', false, true]],
  ] as const)(
    '%s delegates to tauri.%s with the same arguments and returns its result',
    async (apiName, tauriName, args) => {
      const sentinel = { marker: `${tauriName}-result` }
      mocked[tauriName].mockResolvedValue(sentinel)

      const fn = (api as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[apiName]
      const result = await fn(...args)

      expect(mocked[tauriName]).toHaveBeenCalledWith(...args)
      expect(result).toBe(sentinel)
    }
  )

  it('apiGetLog forwards the options object as-is', async () => {
    const opts = { limit: 50, branch: 'main' }
    mocked.getLog.mockResolvedValue([])
    await api.apiGetLog(PATH, opts)
    expect(mocked.getLog).toHaveBeenCalledWith(PATH, opts)
  })

  it('apiUpdateStashMessage delegates to editStashMessage', async () => {
    mocked.editStashMessage.mockResolvedValue(undefined)
    await api.apiUpdateStashMessage(PATH, 2, 'renamed')
    expect(mocked.editStashMessage).toHaveBeenCalledWith(PATH, 2, 'renamed')
  })
})

describe('apiPushBranch — transfer outcome', () => {
  beforeEach(() => {
    useRemoteProgressStore.setState({ operations: {} })
  })

  function pushOutcome() {
    return useRemoteProgressStore.getState().operations[remoteOperationKey(PATH, 'push')]?.outcome
  }

  it('records a rejected pre-push hook’s own output, not the generic error text', async () => {
    // "The pre-push hook stopped the operation" tells the user nothing actionable; the three
    // lines the hook printed tell them exactly which check failed.
    mocked.pushBranch.mockRejectedValue(
      hookFailedError('husky - pre-push hook exited with code 1\nlint failed on src/index.ts')
    )

    await expect(api.apiPushBranch(PATH, 'origin', false)).rejects.toThrow(Error)

    expect(pushOutcome()).toEqual({
      kind: 'error',
      message: 'husky - pre-push hook exited with code 1\nlint failed on src/index.ts',
    })
  })

  it('falls back to the error’s own text for a failure that is not a hook', async () => {
    mocked.pushBranch.mockRejectedValue(new Error('failed to push some refs (non-fast-forward)'))

    await expect(api.apiPushBranch(PATH, 'origin', false)).rejects.toThrow(Error)

    expect(pushOutcome()).toEqual({
      kind: 'error',
      message: 'Error: failed to push some refs (non-fast-forward)',
    })
  })

  it('records a successful push', async () => {
    mocked.pushBranch.mockResolvedValue(undefined)
    await api.apiPushBranch(PATH, 'origin', false)
    expect(pushOutcome()).toEqual({ kind: 'success' })
  })
})
