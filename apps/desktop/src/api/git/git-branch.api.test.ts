import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { GitBranch } from '@git-manager/git-types'
import type { WorktreeSnapshot } from '../../lib/tauri'
import { useUndoHistoryStore } from '../../stores/undoHistory.store'

vi.mock('../../lib/tauri', async () => {
  const actual = await vi.importActual<typeof import('../../lib/tauri')>('../../lib/tauri')
  return {
    ...actual,
    getBranches: vi.fn(),
    checkoutBranch: vi.fn(),
    deleteBranch: vi.fn(),
    deleteRemoteBranch: vi.fn(),
    createBranch: vi.fn(),
    setBranchUpstream: vi.fn(),
    createTag: vi.fn(),
    getTags: vi.fn(),
    pinObject: vi.fn(),
    snapshotWorktree: vi.fn(),
    getRepoSummary: vi.fn(),
    resolveRevision: vi.fn(),
  }
})

import * as tauri from '../../lib/tauri'
import * as api from './git-branch.api'

const mocked = tauri as unknown as Record<string, ReturnType<typeof vi.fn>>

function headBranch(commitOid: string): GitBranch[] {
  return [
    {
      name: 'main',
      shortName: 'main',
      isHead: true,
      isRemote: false,
      commitOid,
      commitMessage: 'msg',
      commitTimestamp: 0,
      aheadCount: 0,
      behindCount: 0,
    },
  ]
}

function snapshot(suffix = ''): WorktreeSnapshot {
  return {
    indexTreeOid: `idx-${suffix}`,
    workdirTreeOid: `wd-${suffix}`,
    indexRefName: `refs/git-manager/undo/idx${suffix}`,
    workdirRefName: `refs/git-manager/undo/wd${suffix}`,
  }
}

let pathCounter = 0
/** Fresh repo path per test so module-level undo state never leaks across tests. */
function freshPath() {
  return `/repo-${++pathCounter}`
}

beforeEach(() => {
  vi.clearAllMocks()
  useUndoHistoryStore.setState({ byRepo: {} })
  mocked.pinObject.mockResolvedValue(undefined)
})

function historyOf(path: string) {
  return useUndoHistoryStore.getState().byRepo[path]
}

describe('apiCheckoutBranch', () => {
  it('pushes a checkout entry with the from/to refs when opts are given', async () => {
    const path = freshPath()
    mocked.checkoutBranch.mockResolvedValue(undefined)

    await api.apiCheckoutBranch(path, 'feat', { fromRef: 'main', fromDetached: false })

    expect(historyOf(path).stack[0]).toMatchObject({
      type: 'checkout',
      fromRef: 'main',
      toRef: 'feat',
      force: false,
    })
  })

  it('force checkout snapshots the worktree first and pins it', async () => {
    const path = freshPath()
    mocked.checkoutBranch.mockResolvedValue(undefined)
    mocked.snapshotWorktree.mockResolvedValue(snapshot('co'))

    await api.apiCheckoutBranch(path, 'feat', { fromRef: 'main', fromDetached: false, force: true })

    const entry = historyOf(path).stack[0]
    expect(entry.pinnedRefs).toEqual(
      expect.arrayContaining(['refs/git-manager/undo/idxco', 'refs/git-manager/undo/wdco'])
    )
  })

  // Leaving a detached HEAD is the one case where the caller's `fromRef` cannot be trusted: every
  // call site reads it from `GitRepo.head`/`GitRepoSummary.head`, which report the literal string
  // "HEAD" when HEAD is not on a branch. Pinning it failed silently (pin_object wants an OID) and
  // undoing the checkout resolved "HEAD" to the branch it was meant to leave.
  it('resolves the detached commit itself rather than trusting the caller', async () => {
    const path = freshPath()
    mocked.checkoutBranch.mockResolvedValue(undefined)
    mocked.resolveRevision.mockResolvedValue('detached-sha')

    await api.apiCheckoutBranch(path, 'main', { fromRef: 'HEAD', fromDetached: true })

    expect(mocked.resolveRevision).toHaveBeenCalledWith(path, 'HEAD')
    const entry = historyOf(path).stack[0]
    // Both the pin and the undo target are the resolved OID, not the string the caller passed.
    expect(mocked.pinObject).toHaveBeenCalledWith(path, `${entry.id}-detached`, 'detached-sha')
    expect(entry).toMatchObject({ type: 'checkout', fromRef: 'detached-sha' })
    expect(entry.pinnedRefs).toContain(`${entry.id}-detached`)
  })

  it('leaves an ordinary branch checkout alone — no revision to resolve', async () => {
    const path = freshPath()
    mocked.checkoutBranch.mockResolvedValue(undefined)

    await api.apiCheckoutBranch(path, 'feat', { fromRef: 'main', fromDetached: false })

    expect(mocked.resolveRevision).not.toHaveBeenCalled()
    expect(historyOf(path).stack[0]).toMatchObject({ fromRef: 'main' })
  })

  it('clears redo when called without opts', async () => {
    const path = freshPath()
    mocked.checkoutBranch.mockResolvedValue(undefined)

    await api.apiCheckoutBranch(path, 'feat')

    expect(historyOf(path)).toBeUndefined()
  })
})

describe('apiDeleteBranch', () => {
  it('pins the branch tip before deleting and pushes a deleteBranch entry', async () => {
    const path = freshPath()
    mocked.deleteBranch.mockResolvedValue(undefined)

    await api.apiDeleteBranch(path, 'feat', { targetOid: 'sha-feat', upstream: 'origin/feat' })

    const entry = historyOf(path).stack[0]
    expect(entry).toMatchObject({
      type: 'deleteBranch',
      name: 'feat',
      targetOid: 'sha-feat',
      upstream: 'origin/feat',
    })
    expect(mocked.pinObject).toHaveBeenCalledWith(path, entry.id, 'sha-feat')
  })
})

describe('apiDeleteRemoteBranch', () => {
  it('forwards the branch name and remote to the backend', async () => {
    const path = freshPath()
    mocked.deleteRemoteBranch.mockResolvedValue(undefined)

    await api.apiDeleteRemoteBranch(path, 'feat', 'upstream')

    expect(mocked.deleteRemoteBranch).toHaveBeenCalledWith(path, 'feat', 'upstream')
  })

  it('defaults the remote to whatever the backend defaults to (origin)', async () => {
    const path = freshPath()
    mocked.deleteRemoteBranch.mockResolvedValue(undefined)

    await api.apiDeleteRemoteBranch(path, 'feat')

    expect(mocked.deleteRemoteBranch).toHaveBeenCalledWith(path, 'feat', undefined)
  })
})

describe('apiCreateBranch', () => {
  it('pins the new branch tip and pushes a createBranch entry', async () => {
    const path = freshPath()
    mocked.createBranch.mockResolvedValue(undefined)
    mocked.getBranches.mockResolvedValue([
      ...headBranch('head-sha'),
      {
        name: 'feat',
        shortName: 'feat',
        isHead: false,
        isRemote: false,
        commitOid: 'feat-sha',
        commitMessage: 'msg',
        commitTimestamp: 0,
        aheadCount: 0,
        behindCount: 0,
      },
    ])

    await api.apiCreateBranch(path, 'feat', 'HEAD')

    const entry = historyOf(path).stack[0]
    expect(entry).toMatchObject({ type: 'createBranch', name: 'feat', targetOid: 'feat-sha' })
    expect(mocked.pinObject).toHaveBeenCalledWith(path, entry.id, 'feat-sha')
  })

  it('clears redo when the new branch cannot be found afterward', async () => {
    const path = freshPath()
    mocked.createBranch.mockResolvedValue(undefined)
    mocked.getBranches.mockResolvedValue([])

    await api.apiCreateBranch(path, 'feat', 'HEAD')

    expect(historyOf(path)).toBeUndefined()
  })
})

describe('apiSetBranchUpstream', () => {
  it('sets the upstream and clears the redo tail', async () => {
    const path = freshPath()
    mocked.setBranchUpstream.mockResolvedValue(undefined)

    await api.apiSetBranchUpstream(path, 'feat', 'origin/feat')

    expect(mocked.setBranchUpstream).toHaveBeenCalledWith(path, 'feat', 'origin/feat')
  })
})

describe('apiCreateTag', () => {
  it('pins the tag target and pushes a createTag entry', async () => {
    const path = freshPath()
    mocked.createTag.mockResolvedValue(undefined)
    mocked.getTags.mockResolvedValue([
      { name: 'refs/tags/v1.0', shortName: 'v1.0', type: 'tag', commitOid: 'tag-sha' },
    ])

    await api.apiCreateTag(path, 'v1.0', 'HEAD', 'release notes')

    const entry = historyOf(path).stack[0]
    expect(entry).toMatchObject({
      type: 'createTag',
      name: 'v1.0',
      targetOid: 'tag-sha',
      message: 'release notes',
    })
    expect(mocked.pinObject).toHaveBeenCalledWith(path, entry.id, 'tag-sha')
  })

  it('clears redo when the new tag cannot be found afterward', async () => {
    const path = freshPath()
    mocked.createTag.mockResolvedValue(undefined)
    mocked.getTags.mockResolvedValue([])

    await api.apiCreateTag(path, 'v1.0', 'HEAD')

    expect(historyOf(path)).toBeUndefined()
  })
})

// The pair is one function because assembling it by hand went wrong at every call site: without a
// shared correlation id, ⌘Z took back only the checkout and then asked git to delete the branch it
// had just made HEAD — refused, and silently. See `apiCreateAndCheckoutBranch`.
describe('apiCreateAndCheckoutBranch', () => {
  beforeEach(() => {
    mocked.createBranch.mockResolvedValue(undefined)
    mocked.checkoutBranch.mockResolvedValue(undefined)
    // `apiCreateBranch` looks the new branch up by name to pin its OID.
    mocked.getBranches.mockResolvedValue([{ ...headBranch('new-sha')[0]!, name: 'feat' }])
    mocked.getRepoSummary.mockResolvedValue({ head: 'main', isDetached: false })
  })

  it('records both operations under one correlation id', async () => {
    const path = freshPath()

    await api.apiCreateAndCheckoutBranch(path, 'feat', 'HEAD')

    const stack = historyOf(path).stack
    expect(stack).toHaveLength(2)
    expect(stack[0]).toMatchObject({ type: 'createBranch', name: 'feat' })
    expect(stack[1]).toMatchObject({ type: 'checkout', toRef: 'feat', fromRef: 'main' })
    expect(stack[0]!.correlationId).toBeTruthy()
    expect(stack[1]!.correlationId).toBe(stack[0]!.correlationId)
  })

  it('reads where HEAD was itself, so the checkout is undoable without the caller helping', async () => {
    const path = freshPath()
    mocked.getRepoSummary.mockResolvedValue({ head: 'main', isDetached: false })

    await api.apiCreateAndCheckoutBranch(path, 'feat', 'HEAD')

    expect(historyOf(path).stack[1]).toMatchObject({ type: 'checkout', fromRef: 'main' })
  })

  // Branching off a detached HEAD records the commit, not the word "HEAD" the summary reports for
  // it — undoing that checkout has to come back to a commit that still means the same thing.
  it('records the commit itself when branching off a detached HEAD', async () => {
    const path = freshPath()
    mocked.getRepoSummary.mockResolvedValue({ head: 'HEAD', isDetached: true })
    mocked.resolveRevision.mockResolvedValue('detached-sha')

    await api.apiCreateAndCheckoutBranch(path, 'feat', 'HEAD')

    expect(historyOf(path).stack[1]).toMatchObject({ type: 'checkout', fromRef: 'detached-sha' })
  })

  it('creates nothing when the repository cannot be read', async () => {
    const path = freshPath()
    mocked.getRepoSummary.mockRejectedValue(new Error('not a repository'))

    await expect(api.apiCreateAndCheckoutBranch(path, 'feat', 'HEAD')).rejects.toThrow()

    expect(mocked.createBranch).not.toHaveBeenCalled()
    expect(historyOf(path)).toBeUndefined()
  })
})
