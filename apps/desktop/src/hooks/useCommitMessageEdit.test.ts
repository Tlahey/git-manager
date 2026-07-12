import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { GitCommit, GitRef, GitStash } from '@git-manager/git-types'

vi.mock('../api/git.api', () => ({ apiCreateCommit: vi.fn(), apiUpdateStashMessage: vi.fn() }))

import { apiCreateCommit, apiUpdateStashMessage } from '../api/git.api'
import { useRepoUIStore } from '../stores/repoUI.store'
import { useCommitMessageEdit } from './useCommitMessageEdit'

const mockedCreateCommit = apiCreateCommit as unknown as ReturnType<typeof vi.fn>
const mockedUpdateStashMessage = apiUpdateStashMessage as unknown as ReturnType<typeof vi.fn>

function commit(overrides: Partial<GitCommit> = {}): GitCommit {
  return {
    oid: 'abc123',
    shortOid: 'abc123',
    message: 'Add feature\n\nDetails here',
    subject: 'Add feature',
    body: 'Details here',
    author: { name: 'me', email: 'me@x.com', timestamp: 0 },
    committer: { name: 'me', email: 'me@x.com', timestamp: 0 },
    parentOids: [],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useRepoUIStore.setState({ editingOid: null })
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useCommitMessageEdit — initial subject/body derivation', () => {
  it('derives subject/body from the commit when not a stash', () => {
    const { result } = renderHook(() =>
      useCommitMessageEdit({
        commit: commit(),
        repoPath: '/repo',
        isStash: false,
        stash: null,
        refs: [],
      })
    )
    expect(result.current.editSubject).toBe('Add feature')
    expect(result.current.editBody).toBe('Details here')
  })

  it('derives subject/body by splitting a stash message on the first blank line', () => {
    const stash: GitStash = {
      index: 0,
      message: 'WIP on main\n\nsome extra context',
      branch: 'main',
      commitOid: 'stash1',
      timestamp: 0,
      filesCount: 1,
      additions: 0,
      deletions: 0,
    }
    const { result } = renderHook(() =>
      useCommitMessageEdit({ commit: commit(), repoPath: '/repo', isStash: true, stash, refs: [] })
    )
    expect(result.current.editSubject).toBe('WIP on main')
    expect(result.current.editBody).toBe('some extra context')
  })

  it('resets fields (and closes edit mode) when the selected commit changes', () => {
    const { result, rerender } = renderHook(
      ({ c }) =>
        useCommitMessageEdit({
          commit: c,
          repoPath: '/repo',
          isStash: false,
          stash: null,
          refs: [],
        }),
      { initialProps: { c: commit({ oid: 'a', subject: 'first' }) } }
    )
    act(() => result.current.setIsEditingMessage(true))
    expect(result.current.isEditingMessage).toBe(true)

    rerender({ c: commit({ oid: 'b', subject: 'second' }) })
    expect(result.current.isEditingMessage).toBe(false)
    expect(result.current.editSubject).toBe('second')
  })
})

describe('useCommitMessageEdit — editingOid interoperability with repoUI.store', () => {
  it('opens edit mode when the global editingOid is set (for an already-rendered commit), then clears it', () => {
    // Realistic flow: the hook is already mounted for this commit (e.g. the row is visible),
    // and some other UI (a context-menu action) sets editingOid afterwards. Pre-setting
    // editingOid before the initial mount instead would race against the reset-on-commit-change
    // effect (also commit-identity-keyed), which unconditionally clears isEditingMessage on the
    // very same mount — not representative of real usage.
    const { result } = renderHook(() =>
      useCommitMessageEdit({
        commit: commit({ oid: 'abc123' }),
        repoPath: '/repo',
        isStash: false,
        stash: null,
        refs: [],
      })
    )
    expect(result.current.isEditingMessage).toBe(false)

    act(() => useRepoUIStore.setState({ editingOid: 'abc123' }))

    expect(result.current.isEditingMessage).toBe(true)
    expect(useRepoUIStore.getState().editingOid).toBeNull()
  })

  it('does not open edit mode when editingOid targets a different commit', () => {
    useRepoUIStore.setState({ editingOid: 'other-oid' })
    const { result } = renderHook(() =>
      useCommitMessageEdit({
        commit: commit({ oid: 'abc123' }),
        repoPath: '/repo',
        isStash: false,
        stash: null,
        refs: [],
      })
    )
    expect(result.current.isEditingMessage).toBe(false)
  })
})

describe('useCommitMessageEdit — saving (commit)', () => {
  it('does nothing when the subject is blank', async () => {
    const { result } = renderHook(() =>
      useCommitMessageEdit({
        commit: commit(),
        repoPath: '/repo',
        isStash: false,
        stash: null,
        refs: [],
      })
    )
    act(() => result.current.setEditSubject('   '))
    await act(async () => result.current.handleUpdateCommitMessage())
    expect(mockedCreateCommit).not.toHaveBeenCalled()
  })

  it('amends with the combined subject+body message', async () => {
    mockedCreateCommit.mockResolvedValue({ oid: 'new', shortOid: 'new' })
    const onRefresh = vi.fn()
    const { result } = renderHook(() =>
      useCommitMessageEdit({
        commit: commit({ oid: 'sha1' }),
        repoPath: '/repo',
        isStash: false,
        stash: null,
        refs: [],
        onRefresh,
      })
    )
    act(() => {
      result.current.setEditSubject('New subject')
      result.current.setEditBody('New body')
    })
    await act(async () => result.current.handleUpdateCommitMessage())

    expect(mockedCreateCommit).toHaveBeenCalledWith(
      '/repo',
      'New subject\n\nNew body',
      true,
      'sha1'
    )
    expect(result.current.isEditingMessage).toBe(false)
    expect(onRefresh).toHaveBeenCalledOnce()
  })

  it('omits the body separator when the body is blank', async () => {
    mockedCreateCommit.mockResolvedValue({ oid: 'new', shortOid: 'new' })
    const { result } = renderHook(() =>
      useCommitMessageEdit({
        commit: commit({ oid: 'sha1' }),
        repoPath: '/repo',
        isStash: false,
        stash: null,
        refs: [],
      })
    )
    act(() => {
      result.current.setEditSubject('Subject only')
      result.current.setEditBody('   ')
    })
    await act(async () => result.current.handleUpdateCommitMessage())
    expect(mockedCreateCommit).toHaveBeenCalledWith('/repo', 'Subject only', true, 'sha1')
  })

  it('amends the WIP pseudo-commit without an oid (amends the actual HEAD instead)', async () => {
    mockedCreateCommit.mockResolvedValue({ oid: 'new', shortOid: 'new' })
    const { result } = renderHook(() =>
      useCommitMessageEdit({
        commit: commit({ oid: 'WIP' }),
        repoPath: '/repo',
        isStash: false,
        stash: null,
        refs: [],
      })
    )
    act(() => {
      result.current.setEditSubject('WIP commit message')
      result.current.setEditBody('')
    })
    await act(async () => result.current.handleUpdateCommitMessage())
    expect(mockedCreateCommit).toHaveBeenCalledWith('/repo', 'WIP commit message', true, undefined)
  })

  it('alerts on failure, leaves edit mode open (only success closes it), and clears the saving flag', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    mockedCreateCommit.mockRejectedValue(new Error('amend failed'))
    const { result } = renderHook(() =>
      useCommitMessageEdit({
        commit: commit(),
        repoPath: '/repo',
        isStash: false,
        stash: null,
        refs: [],
      })
    )
    act(() => {
      result.current.setEditSubject('Subject')
      result.current.setIsEditingMessage(true)
    })
    await act(async () => result.current.handleUpdateCommitMessage())

    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('amend failed'))
    expect(result.current.isSavingMessage).toBe(false)
    expect(result.current.isEditingMessage).toBe(true)
  })
})

describe('useCommitMessageEdit — saving (stash)', () => {
  const refs: GitRef[] = [
    { name: 'refs/stash@{2}', shortName: 'stash@{2}', type: 'stash', commitOid: 'stash-oid' },
  ]

  it('parses the stash index from refs and renames it', async () => {
    mockedUpdateStashMessage.mockResolvedValue(undefined)
    const onRefresh = vi.fn()
    const { result } = renderHook(() =>
      useCommitMessageEdit({
        commit: commit(),
        repoPath: '/repo',
        isStash: true,
        stash: null,
        refs,
        onRefresh,
      })
    )
    act(() => {
      result.current.setEditSubject('Renamed stash')
      result.current.setEditBody('')
    })
    await act(async () => result.current.handleUpdateCommitMessage())

    expect(mockedUpdateStashMessage).toHaveBeenCalledWith('/repo', 2, 'Renamed stash')
    expect(onRefresh).toHaveBeenCalledOnce()
  })

  it('defaults to stash index 0 when no stash ref is found', async () => {
    mockedUpdateStashMessage.mockResolvedValue(undefined)
    const { result } = renderHook(() =>
      useCommitMessageEdit({
        commit: commit(),
        repoPath: '/repo',
        isStash: true,
        stash: null,
        refs: [],
      })
    )
    act(() => {
      result.current.setEditSubject('Renamed stash')
      result.current.setEditBody('')
    })
    await act(async () => result.current.handleUpdateCommitMessage())
    expect(mockedUpdateStashMessage).toHaveBeenCalledWith('/repo', 0, 'Renamed stash')
  })
})

describe('useCommitMessageEdit — copy SHA', () => {
  it('copies the commit oid and resets the "copied" flag after 1.5s', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() =>
      useCommitMessageEdit({
        commit: commit({ oid: 'sha-to-copy' }),
        repoPath: '/repo',
        isStash: false,
        stash: null,
        refs: [],
      })
    )
    await act(async () => result.current.handleCopySha())
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('sha-to-copy')
    expect(result.current.copied).toBe(true)

    act(() => vi.advanceTimersByTime(1500))
    expect(result.current.copied).toBe(false)
    vi.useRealTimers()
  })
})
