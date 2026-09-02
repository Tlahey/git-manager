import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { AiContext, CommitMessageDraft } from '@git-manager/ai'

vi.mock('../api/ai.api', () => ({
  apiGetAiContext: vi.fn(),
  fileSummaryService: { run: vi.fn() },
  summaryCommitMessageService: { run: vi.fn() },
}))

import { apiGetAiContext, fileSummaryService, summaryCommitMessageService } from '../api/ai.api'
import { useAiGeneration } from './useAiGeneration'

const mockedGetContext = apiGetAiContext as unknown as ReturnType<typeof vi.fn>
const mockedSummarize = fileSummaryService.run as unknown as ReturnType<typeof vi.fn>
const mockedCompose = summaryCommitMessageService.run as unknown as ReturnType<typeof vi.fn>

const context: AiContext = {
  diff: 'diff body',
  repoName: 'demo',
  branch: 'main',
  files: [{ path: 'src/a.ts', status: 'modified' }],
  // Conventional history so the adaptive validator actually enforces the format in these tests.
  recentCommits: ['feat: one', 'fix: two', 'chore: three', 'refactor: four'],
}

const draft = (subject: string, body = ''): CommitMessageDraft => ({ subject, body })

beforeEach(() => {
  vi.clearAllMocks()
  mockedGetContext.mockResolvedValue(context)
  mockedCompose.mockResolvedValue(draft('feat: add a proper subject'))
  mockedSummarize.mockResolvedValue({ intent: 'changes it', area: 'demo area' })
})

describe('useAiGeneration', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => useAiGeneration('/repo'))
    expect(result.current.status).toBe('idle')
  })

  it('hands the finished message back in one piece', async () => {
    const onMessage = vi.fn()
    const { result } = renderHook(() => useAiGeneration('/repo'))

    await act(async () => {
      await result.current.generate(onMessage)
    })

    expect(onMessage).toHaveBeenCalledExactlyOnceWith('feat: add a proper subject')
    expect(result.current.status).toBe('done')
  })

  it('joins a body to the subject with a blank line, as git expects', async () => {
    mockedCompose.mockResolvedValue(draft('feat: add a thing', 'Because the old one broke.'))
    const onMessage = vi.fn()
    const { result } = renderHook(() => useAiGeneration('/repo'))

    await act(async () => {
      await result.current.generate(onMessage)
    })

    expect(onMessage).toHaveBeenCalledWith('feat: add a thing\n\nBecause the old one broke.')
  })

  it('errors without calling the service when there are no staged changes', async () => {
    mockedGetContext.mockResolvedValue({ ...context, diff: '   ' })
    const { result } = renderHook(() => useAiGeneration('/repo'))

    await act(async () => {
      await result.current.generate(vi.fn())
    })

    expect(result.current.status).toBe('error')
    expect(result.current.error).toBe('No staged changes')
    expect(mockedCompose).not.toHaveBeenCalled()
  })

  it('surfaces a provider failure from the rejected request', async () => {
    mockedCompose.mockRejectedValue(new Error('model not found'))
    const { result } = renderHook(() => useAiGeneration('/repo'))

    await act(async () => {
      await result.current.generate(vi.fn())
    })

    expect(result.current.status).toBe('error')
    expect(result.current.error).toContain('model not found')
  })

  it('validates the generated message against the project convention', async () => {
    const { result } = renderHook(() => useAiGeneration('/repo'))
    await act(async () => {
      await result.current.generate(vi.fn())
    })
    expect(result.current.validation?.valid).toBe(true)
  })

  it('flags a non-conventional generated message via validation', async () => {
    mockedCompose.mockResolvedValue(draft('just some text'))
    const { result } = renderHook(() => useAiGeneration('/repo'))
    await act(async () => {
      await result.current.generate(vi.fn())
    })
    expect(result.current.validation?.valid).toBe(false)
  })

  it('clears the previous validation when a new generation starts', async () => {
    mockedCompose.mockResolvedValue(draft('just some text'))
    const { result } = renderHook(() => useAiGeneration('/repo'))
    await act(async () => {
      await result.current.generate(vi.fn())
    })
    expect(result.current.validation?.valid).toBe(false)

    // Never settles, so the run is still in flight when we assert — which is where a stale
    // validation would still be on screen.
    mockedCompose.mockReturnValue(new Promise(() => {}))
    act(() => {
      void result.current.generate(vi.fn())
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.validation).toBeNull()
  })
})

describe('useAiGeneration — cancelling', () => {
  it('does not write back a cancelled generation', async () => {
    // The *composing* call is the one still only abandoned rather than called off — the map phase
    // above it cancels its in-flight request properly. What the user asked for is that the box be
    // left alone, and it is.
    let settle: (d: CommitMessageDraft) => void = () => {}
    mockedCompose.mockReturnValue(
      new Promise<CommitMessageDraft>((resolve) => {
        settle = resolve
      })
    )
    const onMessage = vi.fn()
    const { result } = renderHook(() => useAiGeneration('/repo'))

    act(() => {
      void result.current.generate(onMessage)
    })
    await act(async () => {
      await Promise.resolve()
    })

    await act(async () => result.current.cancel())
    await act(async () => {
      settle(draft('feat: too late'))
      await Promise.resolve()
    })

    expect(onMessage).not.toHaveBeenCalled()
    expect(result.current.validation).toBeNull()
    expect(result.current.status).toBe('cancelled')
  })

  it('does not report an error for a request that failed after being cancelled', async () => {
    let fail: (e: Error) => void = () => {}
    mockedCompose.mockReturnValue(
      new Promise<CommitMessageDraft>((_, reject) => {
        fail = reject
      })
    )
    const { result } = renderHook(() => useAiGeneration('/repo'))

    act(() => {
      void result.current.generate(vi.fn())
    })
    await act(async () => {
      await Promise.resolve()
    })
    await act(async () => result.current.cancel())
    await act(async () => {
      fail(new Error('aborted'))
      await Promise.resolve()
    })

    expect(result.current.status).toBe('cancelled')
    expect(result.current.error).toBeNull()
  })

  /**
   * The exact race from issue #504: `cancel` flips `status` to `'cancelled'` synchronously, well
   * before the abandoned run's post-await guard (`if (cancelledRef.current) return`, right after the
   * `compose` call) has actually observed the cancel. If a second `generate()` starts in that
   * window, it used to reset the same shared `cancelledRef` the first run still reads — silently
   * un-cancelling it and letting its late-arriving message overwrite whatever the second run wrote
   * into the commit-message box.
   */
  it('never lets a cancelled generation’s late result reach a generate started right after it', async () => {
    let settleStale: (d: CommitMessageDraft) => void = () => {}
    mockedCompose
      .mockImplementationOnce(
        () =>
          new Promise<CommitMessageDraft>((resolve) => {
            settleStale = resolve
          })
      )
      .mockResolvedValueOnce(draft('feat: the fresh message'))

    const onMessage = vi.fn()
    const { result } = renderHook(() => useAiGeneration('/repo'))

    act(() => {
      void result.current.generate(onMessage)
    })
    await act(async () => {
      await Promise.resolve()
    })

    // Cancel while the stale run's compose call is still in flight, then immediately start a new
    // run — before the abandoned run's post-await guard has had a chance to notice the cancel.
    await act(async () => {
      await result.current.cancel()
      await result.current.generate(onMessage)
    })

    expect(onMessage).toHaveBeenCalledExactlyOnceWith('feat: the fresh message')
    expect(result.current.status).toBe('done')

    // The stale run's in-flight compose call finally answers — its callback must be a no-op now
    // that a newer run has superseded it, not a write into the box the fresh run just filled.
    await act(async () => {
      settleStale(draft('feat: too late'))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onMessage).toHaveBeenCalledExactlyOnceWith('feat: the fresh message')
    expect(onMessage).not.toHaveBeenCalledWith('feat: too late')
    expect(result.current.status).toBe('done')
  })
})
