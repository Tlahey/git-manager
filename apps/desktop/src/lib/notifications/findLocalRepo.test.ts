import { describe, it, expect, vi, beforeEach } from 'vitest'

const apiGetRemotes = vi.hoisted(() => vi.fn())
vi.mock('../../api/git.api', () => ({ apiGetRemotes: (...a: unknown[]) => apiGetRemotes(...a) }))

import { findLocalRepoPath } from './findLocalRepo'

const SAVED = [
  { path: '/code/other', name: 'other' },
  { path: '/code/gm-checkout', name: 'gm-checkout' },
]

function remotesByPath(map: Record<string, string[]>) {
  apiGetRemotes.mockImplementation(async (path: string) =>
    (map[path] ?? []).map((url) => ({ name: 'origin', url }))
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('findLocalRepoPath', () => {
  // The whole point of matching on the remote: a checkout's directory can be called anything.
  it('matches on the GitHub remote, not the folder name', async () => {
    remotesByPath({
      '/code/other': ['git@github.com:someone/other.git'],
      '/code/gm-checkout': ['https://github.com/Tlahey/git-manager.git'],
    })

    const path = await findLocalRepoPath(
      { fullName: 'Tlahey/git-manager', name: 'git-manager' },
      SAVED
    )
    expect(path).toBe('/code/gm-checkout')
  })

  it('matches case-insensitively, since GitHub owners and repos are', async () => {
    remotesByPath({ '/code/gm-checkout': ['https://github.com/tlahey/GIT-MANAGER.git'] })
    const path = await findLocalRepoPath({ fullName: 'Tlahey/git-manager', name: 'x' }, SAVED)
    expect(path).toBe('/code/gm-checkout')
  })

  it('falls back to the repo name when no remote matched', async () => {
    remotesByPath({})
    const path = await findLocalRepoPath({ fullName: 'Tlahey/git-manager', name: 'other' }, SAVED)
    expect(path).toBe('/code/other')
  })

  it('returns null when the repo is not among the added ones', async () => {
    remotesByPath({})
    const path = await findLocalRepoPath({ fullName: 'a/b', name: 'b' }, SAVED)
    expect(path).toBeNull()
  })

  // A repo on an unmounted drive, or one that has been moved away, simply isn't the match — it
  // must not abort the search before the repo that is.
  it('skips a repo whose remotes cannot be read', async () => {
    apiGetRemotes.mockImplementation(async (path: string) => {
      if (path === '/code/other') throw new Error('not a repository')
      return [{ name: 'origin', url: 'https://github.com/Tlahey/git-manager.git' }]
    })

    const path = await findLocalRepoPath({ fullName: 'Tlahey/git-manager', name: 'x' }, SAVED)
    expect(path).toBe('/code/gm-checkout')
  })

  // `repo` alone is ambiguous (two owners can both have a `docs`), so a payload without a
  // `fullName` shouldn't cost a remote read per added repo.
  it('does not read remotes at all when no fullName is known', async () => {
    const path = await findLocalRepoPath({ name: 'other' }, SAVED)
    expect(path).toBe('/code/other')
    expect(apiGetRemotes).not.toHaveBeenCalled()
  })
})
