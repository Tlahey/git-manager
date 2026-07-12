import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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
    editStashMessage: vi.fn(),
    stashList: vi.fn(),
    getRemotes: vi.fn(),
    getCommitWebUrl: vi.fn(),
    getRepoStatus: vi.fn(),
    getLog: vi.fn(),
    getBranches: vi.fn(),
    getCommitDiff: vi.fn(),
    compareCommitToWorkdir: vi.fn(),
    getFileDiff: vi.fn(),
    getFileRawContents: vi.fn(),
    getCommitFileVsWorkdir: vi.fn(),
    isCommitOnCurrentBranch: vi.fn(),
    getTags: vi.fn(),
    listSubmodules: vi.fn(),
    getRebaseState: vi.fn(),
    listRebaseCommits: vi.fn(),
    createBranch: vi.fn(),
    createTag: vi.fn(),
    fetchRemote: vi.fn(),
    pullBranch: vi.fn(),
    pushBranch: vi.fn(),
  }
})

import * as tauri from '../lib/tauri'
import * as api from './git.api'
import { appEventBus } from '../lib/appEventBus'

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
  let listener: ReturnType<typeof vi.fn>
  let unsubscribe: () => void

  beforeEach(() => {
    listener = vi.fn()
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
    ['apiStashList', 'stashList', [PATH]],
    ['apiGetRemotes', 'getRemotes', [PATH]],
    ['apiGetCommitWebUrl', 'getCommitWebUrl', [PATH, 'oid1', 'origin']],
    ['apiGetRepoStatus', 'getRepoStatus', [PATH]],
    ['apiGetBranches', 'getBranches', [PATH, true]],
    ['apiGetCommitDiff', 'getCommitDiff', [PATH, 'oid1']],
    ['apiCompareCommitToWorkdir', 'compareCommitToWorkdir', [PATH, 'oid1']],
    ['apiGetFileDiff', 'getFileDiff', [PATH, 'a.ts', true, 'oid1']],
    ['apiGetFileRawContents', 'getFileRawContents', [PATH, 'a.ts', false, undefined]],
    ['apiGetCommitFileVsWorkdir', 'getCommitFileVsWorkdir', [PATH, 'oid1', 'a.ts']],
    ['apiIsCommitOnCurrentBranch', 'isCommitOnCurrentBranch', [PATH, 'oid1']],
    ['apiGetTags', 'getTags', [PATH]],
    ['apiListSubmodules', 'listSubmodules', [PATH]],
    ['apiGetRebaseState', 'getRebaseState', [PATH]],
    ['apiListRebaseCommits', 'listRebaseCommits', [PATH, 'baseOid']],
    ['apiCreateBranch', 'createBranch', [PATH, 'feature-x', 'main']],
    ['apiCreateTag', 'createTag', [PATH, 'v1.0', 'main', 'release']],
    ['apiFetchRemote', 'fetchRemote', [PATH, 'origin']],
    ['apiPullBranch', 'pullBranch', [PATH, 'origin', true]],
    ['apiPushBranch', 'pushBranch', [PATH, 'origin', false]],
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
