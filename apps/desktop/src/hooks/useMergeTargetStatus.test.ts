import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { GitBranch } from '@git-manager/git-types'

const swrSpy = vi.fn()
vi.mock('swr', () => ({ default: (...args: unknown[]) => swrSpy(...args) }))

vi.mock('../api/mergeTarget.api', () => ({ apiGetMergeTargetStatus: vi.fn() }))

const branchesSpy = vi.fn()
vi.mock('./useBranches', () => ({ useBranches: (path: string) => branchesSpy(path) }))

import { apiGetMergeTargetStatus } from '../api/mergeTarget.api'
import { useMergeTargetStatus } from './useMergeTargetStatus'
import { useSettingsStore } from '../stores/settings.store'
import { DEFAULT_TARGET_BRANCHES } from './useEffectiveRepoSettings'

/** The SWR key the hook computed on its last render. */
function lastKey(): unknown {
  return swrSpy.mock.calls.at(-1)?.[0]
}

/** Runs the fetcher SWR was handed, as SWR itself would. */
async function runFetcher() {
  const fetcher = swrSpy.mock.calls.at(-1)?.[1] as () => Promise<unknown>
  return fetcher()
}

function branch(overrides: Partial<GitBranch> = {}): GitBranch {
  return {
    name: 'refs/heads/feature',
    shortName: 'feature',
    isHead: true,
    isRemote: false,
    commitOid: 'aaa',
    commitMessage: 'm',
    commitTimestamp: 0,
    aheadCount: 0,
    behindCount: 0,
    ...overrides,
  }
}

const INITIAL_SETTINGS = useSettingsStore.getState().settings

beforeEach(() => {
  vi.clearAllMocks()
  swrSpy.mockReturnValue({ data: undefined })
  branchesSpy.mockReturnValue({ data: [] })
  useSettingsStore.setState({ settings: INITIAL_SETTINGS })
})

describe('useMergeTargetStatus', () => {
  it('passes a null key (so SWR skips the fetch) when no repo is open', () => {
    renderHook(() => useMergeTargetStatus(null))
    expect(lastKey()).toBeNull()
  })

  it('fetches with the repo default target branches', async () => {
    renderHook(() => useMergeTargetStatus('/repo'))
    await runFetcher()
    expect(apiGetMergeTargetStatus).toHaveBeenCalledWith('/repo', DEFAULT_TARGET_BRANCHES)
  })

  it("uses the repo's configured target branches when it overrides them", async () => {
    useSettingsStore.getState().setRepoSetting('/repo', 'targetBranches', ['origin/develop'])

    renderHook(() => useMergeTargetStatus('/repo'))
    await runFetcher()

    expect(apiGetMergeTargetStatus).toHaveBeenCalledWith('/repo', ['origin/develop'])
    expect(lastKey()).toEqual(['merge-target-status', '/repo', 'origin/develop', ''])
  })

  it('re-keys the query when a branch tip moves, so a commit or fetch refetches it', () => {
    branchesSpy.mockReturnValue({ data: [branch({ commitOid: 'aaa' })] })
    const { rerender } = renderHook(() => useMergeTargetStatus('/repo'))
    const before = lastKey()

    branchesSpy.mockReturnValue({ data: [branch({ commitOid: 'bbb' })] })
    rerender()

    expect(lastKey()).not.toEqual(before)
    expect(lastKey()).toEqual([
      'merge-target-status',
      '/repo',
      DEFAULT_TARGET_BRANCHES.join(','),
      'refs/heads/feature@bbb',
    ])
  })

  it('keeps the same key while nothing changes', () => {
    branchesSpy.mockReturnValue({ data: [branch()] })
    const { rerender } = renderHook(() => useMergeTargetStatus('/repo'))
    const before = lastKey()

    rerender()

    expect(lastKey()).toEqual(before)
  })
})
