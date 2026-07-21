import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { GitRef } from '@git-manager/git-types'

// Hoisted so the vi.mock factories (evaluated during the hoisted static imports below) can safely
// reference these — a plain top-level const would still be in its TDZ at that point.
const { showMenu, openPrCreateWith, invalidateQueries, api } = vi.hoisted(() => ({
  showMenu: vi.fn(),
  openPrCreateWith: vi.fn(),
  invalidateQueries: vi.fn(),
  api: {
    apiCheckoutBranch: vi.fn(async () => {}),
    apiMergeBranch: vi.fn(async () => {}),
    apiFastForwardBranch: vi.fn(async () => {}),
    apiPushBranchTo: vi.fn(async () => {}),
    apiRebaseOntoCommit: vi.fn(async () => {}),
    apiResetToCommit: vi.fn(async () => {}),
  },
}))

vi.mock('../api/nativeMenu.api', () => ({
  showRefDropNativeContextMenu: (opts: unknown) => showMenu(opts),
}))
vi.mock('../api/git.api', () => api)
vi.mock('@git-manager/ui', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries }) }))
vi.mock('../stores/repoData.store', () => ({
  useRepoDataStore: (sel: (s: unknown) => unknown) =>
    sel({ repoCache: { '/r': { head: 'current', isDetached: false } } }),
}))
vi.mock('../stores/repoUI.store', () => ({
  useRepoUIStore: (sel: (s: unknown) => unknown) => sel({ openPrCreateWith }),
}))

import { useRefDrop } from './useRefDrop'

const branch = (shortName: string, oid = 'oid-' + shortName): GitRef => ({
  name: `refs/heads/${shortName}`,
  shortName,
  type: 'branch',
  commitOid: oid,
})
const tag = (shortName: string): GitRef => ({
  name: `refs/tags/${shortName}`,
  shortName,
  type: 'tag',
  commitOid: 'oid-' + shortName,
})

type MenuOpts = Parameters<typeof import('../api/nativeMenu.api').showRefDropNativeContextMenu>[0]

function dropAndGetOpts(source: GitRef, target: GitRef): MenuOpts {
  const { result } = renderHook(() => useRefDrop('/r'))
  result.current.handleDrop(source, target)
  return showMenu.mock.calls.at(-1)![0] as MenuOpts
}

const flush = () => new Promise((r) => setTimeout(r))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useRefDrop — enablement', () => {
  it('enables every action when dragging a branch onto a branch', () => {
    const opts = dropAndGetOpts(branch('feat'), branch('main'))
    expect(opts.fastForwardEnabled).toBe(true)
    expect(opts.mergeEnabled).toBe(true)
    expect(opts.rebaseEnabled).toBe(true)
    expect(opts.pushEnabled).toBe(true)
    expect(opts.resetEnabled).toBe(true)
    expect(opts.prEnabled).toBe(true)
  })

  it('disables source-rewriting actions and PR when the source is a tag', () => {
    const opts = dropAndGetOpts(tag('v1'), branch('main'))
    expect(opts.rebaseEnabled).toBe(false)
    expect(opts.resetEnabled).toBe(false)
    expect(opts.pushEnabled).toBe(false)
    expect(opts.prEnabled).toBe(false)
    // Target is still a local branch, so it can receive a fast-forward / merge from the tag.
    expect(opts.fastForwardEnabled).toBe(true)
    expect(opts.mergeEnabled).toBe(true)
  })

  it('disables fast-forward/merge when the target is not a local branch', () => {
    const opts = dropAndGetOpts(branch('feat'), tag('v1'))
    expect(opts.fastForwardEnabled).toBe(false)
    expect(opts.mergeEnabled).toBe(false)
  })
})

describe('useRefDrop — actions', () => {
  it('merges source into target', async () => {
    const opts = dropAndGetOpts(branch('feat'), branch('main'))
    opts.onMerge()
    await flush()
    expect(api.apiMergeBranch).toHaveBeenCalledWith('/r', 'feat', 'main')
  })

  it('fast-forwards target to source', async () => {
    const opts = dropAndGetOpts(branch('feat'), branch('main'))
    opts.onFastForward()
    await flush()
    expect(api.apiFastForwardBranch).toHaveBeenCalledWith('/r', 'feat', 'main')
  })

  it('checks out the source then rebases it onto the target commit', async () => {
    const target = branch('main', 'main-oid')
    const opts = dropAndGetOpts(branch('feat'), target)
    opts.onRebase()
    await flush()
    expect(api.apiCheckoutBranch).toHaveBeenCalledWith(
      '/r',
      'feat',
      expect.objectContaining({ fromRef: 'current' })
    )
    expect(api.apiRebaseOntoCommit).toHaveBeenCalledWith('/r', 'main-oid')
  })

  it('checks out the source then resets it to the target commit', async () => {
    const target = branch('main', 'main-oid')
    const opts = dropAndGetOpts(branch('feat'), target)
    opts.onReset('hard')
    await flush()
    expect(api.apiCheckoutBranch).toHaveBeenCalledWith('/r', 'feat', expect.any(Object))
    expect(api.apiResetToCommit).toHaveBeenCalledWith('/r', 'main-oid', 'hard')
  })

  it('pushes the source to the target on origin', async () => {
    const opts = dropAndGetOpts(branch('feat'), branch('main'))
    opts.onPush()
    await flush()
    expect(api.apiPushBranchTo).toHaveBeenCalledWith('/r', 'feat', 'main', 'origin')
  })

  it('opens the PR-create view prefilled with source → target', () => {
    const opts = dropAndGetOpts(branch('feat'), branch('main'))
    opts.onStartPr()
    expect(openPrCreateWith).toHaveBeenCalledWith('feat', 'main')
  })
})
