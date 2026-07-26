import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { GitDiff } from '@git-manager/git-types'

const { listeners, listen } = vi.hoisted(() => {
  const listeners = new Map<string, Set<(e: { payload: unknown }) => void>>()
  const listen = vi.fn(async (event: string, handler: (e: { payload: unknown }) => void) => {
    if (!listeners.has(event)) listeners.set(event, new Set())
    listeners.get(event)!.add(handler)
    return () => listeners.get(event)?.delete(handler)
  })
  return { listeners, listen }
})
vi.mock('@tauri-apps/api/event', () => ({ listen }))

function emit(event: string, payload?: unknown) {
  listeners.get(event)?.forEach((h) => h({ payload }))
}

vi.mock('../api/ai.api', () => ({
  commitExplanationService: { run: vi.fn(), cancel: vi.fn() },
}))
vi.mock('../api/git.api', () => ({ apiGetCommitDiff: vi.fn() }))

import { commitExplanationService } from '../api/ai.api'
import { apiGetCommitDiff } from '../api/git.api'
import { useCommitExplanation, type CommitExplanationSubject } from './useCommitExplanation'
import { useAiExplanationStore } from '../stores/aiExplanation.store'
import { useSettingsStore } from '../stores/settings.store'

const mockedDiff = apiGetCommitDiff as unknown as ReturnType<typeof vi.fn>
const mockedRun = commitExplanationService.run as unknown as ReturnType<typeof vi.fn>

const diff: GitDiff = {
  files: [
    {
      oldPath: 'src/a.ts',
      newPath: 'src/a.ts',
      status: 'modified',
      additions: 2,
      deletions: 1,
      isBinary: false,
      hunks: [
        {
          header: '@@ -1,2 +1,3 @@',
          lines: [{ origin: '+', content: 'const b = 2', oldLineno: null, newLineno: 2 }],
        },
      ],
    },
  ],
  totalAdditions: 2,
  totalDeletions: 1,
}

function subject(overrides: Partial<CommitExplanationSubject> = {}): CommitExplanationSubject {
  return {
    oid: 'abc1234def',
    shortOid: 'abc1234',
    subject: 'feat: add login',
    body: 'Closes #12.',
    author: 'Ada',
    parentCount: 1,
    ...overrides,
  }
}

async function generate(explain: () => Promise<void>, text = 'Adds a constant') {
  await act(async () => {
    await explain()
  })
  await act(async () => {
    emit('ai:token', text)
    emit('ai:done')
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  listeners.clear()
  useAiExplanationStore.setState({ explanations: {} })
  mockedDiff.mockResolvedValue(diff)
  mockedRun.mockResolvedValue(undefined)
})

describe('useCommitExplanation', () => {
  it('fetches the commit diff and sends it as a unified patch', async () => {
    const { result } = renderHook(() => useCommitExplanation('/repo/demo', subject()))
    await act(async () => {
      await result.current.explain()
    })

    expect(mockedDiff).toHaveBeenCalledWith('/repo/demo', 'abc1234def')
    const input = mockedRun.mock.calls[0][1]
    expect(input.patch).toContain('@@ -1,2 +1,3 @@')
    expect(input.patch).toContain('+const b = 2')
    expect(input.repoName).toBe('demo')
  })

  it('passes the commit metadata and the stats from the diff', async () => {
    useSettingsStore.setState((s) => ({ settings: { ...s.settings, language: 'fr' } }))
    const { result } = renderHook(() => useCommitExplanation('/repo/demo', subject()))
    await act(async () => {
      await result.current.explain()
    })

    const input = mockedRun.mock.calls[0][1]
    expect(input.commit).toMatchObject({
      shortOid: 'abc1234',
      subject: 'feat: add login',
      body: 'Closes #12.',
      author: 'Ada',
      filesChanged: 1,
      insertions: 2,
      deletions: 1,
      isMerge: false,
    })
    expect(input.language).toBe('fr')
  })

  it('flags a merge commit so the model knows the diff is first-parent only', async () => {
    const { result } = renderHook(() =>
      useCommitExplanation('/repo/demo', subject({ parentCount: 2 }))
    )
    await act(async () => {
      await result.current.explain()
    })
    expect(mockedRun.mock.calls[0][1].commit.isMerge).toBe(true)
  })

  it('refuses a commit with no textual diff, without calling the model', async () => {
    mockedDiff.mockResolvedValue({ files: [], totalAdditions: 0, totalDeletions: 0 })
    const { result } = renderHook(() => useCommitExplanation('/repo/demo', subject()))
    await act(async () => {
      await result.current.explain()
    })
    expect(mockedRun).not.toHaveBeenCalled()
    expect(result.current.error).toBe('AI_NO_COMMIT_CHANGES')
  })

  it('surfaces a failure from the diff fetch', async () => {
    mockedDiff.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useCommitExplanation('/repo/demo', subject()))
    await act(async () => {
      await result.current.explain()
    })
    expect(result.current.status).toBe('error')
    expect(result.current.error).toContain('boom')
  })
})

describe('useCommitExplanation — memory', () => {
  it('remembers a completed explanation against the parent', async () => {
    const { result } = renderHook(() => useCommitExplanation('/repo/demo', subject()))
    await generate(() => result.current.explain())

    expect(useAiExplanationStore.getState().get('/repo/demo', 'commit', 'abc1234def')).toMatchObject(
      { text: 'Adds a constant', comparedTo: 'abc1234^' }
    )
  })

  it('records a root commit as compared to nothing', async () => {
    const { result } = renderHook(() =>
      useCommitExplanation('/repo/demo', subject({ parentCount: 0 }))
    )
    await generate(() => result.current.explain())
    expect(
      useAiExplanationStore.getState().get('/repo/demo', 'commit', 'abc1234def')?.comparedTo
    ).toBe('root')
  })

  it('serves the remembered explanation on a fresh mount, without regenerating', async () => {
    const first = renderHook(() => useCommitExplanation('/repo/demo', subject()))
    await generate(() => first.result.current.explain())
    first.unmount()
    vi.clearAllMocks()

    const { result } = renderHook(() => useCommitExplanation('/repo/demo', subject()))
    expect(result.current.text).toBe('Adds a constant')
    expect(result.current.hasStored).toBe(true)
    expect(mockedRun).not.toHaveBeenCalled()
  })

  it('does not collide with a branch explanation of the same name', async () => {
    useAiExplanationStore.getState().set('/repo/demo', 'branch', 'abc1234def', 'main', 'branch text')
    const { result } = renderHook(() => useCommitExplanation('/repo/demo', subject()))
    expect(result.current.hasStored).toBe(false)
  })

  it('clear forgets it', async () => {
    const { result } = renderHook(() => useCommitExplanation('/repo/demo', subject()))
    await generate(() => result.current.explain())
    act(() => result.current.clear())
    expect(
      useAiExplanationStore.getState().get('/repo/demo', 'commit', 'abc1234def')
    ).toBeUndefined()
  })
})
