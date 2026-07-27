import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { AiContext, CommitMessageDraft } from '@git-manager/ai'

vi.mock('../api/ai.api', () => ({
  apiGetAiContext: vi.fn(),
  commitMessageService: { run: vi.fn() },
}))

import { apiGetAiContext, commitMessageService } from '../api/ai.api'
import { useAiGeneration } from './useAiGeneration'

const mockedGetContext = apiGetAiContext as unknown as ReturnType<typeof vi.fn>
const mockedRun = commitMessageService.run as unknown as ReturnType<typeof vi.fn>

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
  mockedRun.mockResolvedValue(draft('feat: add a proper subject'))
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
    mockedRun.mockResolvedValue(draft('feat: add a thing', 'Because the old one broke.'))
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
    expect(mockedRun).not.toHaveBeenCalled()
  })

  it('surfaces a provider failure from the rejected request', async () => {
    mockedRun.mockRejectedValue(new Error('model not found'))
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
    mockedRun.mockResolvedValue(draft('just some text'))
    const { result } = renderHook(() => useAiGeneration('/repo'))
    await act(async () => {
      await result.current.generate(vi.fn())
    })
    expect(result.current.validation?.valid).toBe(false)
  })

  it('clears the previous validation when a new generation starts', async () => {
    mockedRun.mockResolvedValue(draft('just some text'))
    const { result } = renderHook(() => useAiGeneration('/repo'))
    await act(async () => {
      await result.current.generate(vi.fn())
    })
    expect(result.current.validation?.valid).toBe(false)

    // Never settles, so the run is still in flight when we assert — which is where a stale
    // validation would still be on screen.
    mockedRun.mockReturnValue(new Promise(() => {}))
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
    // `ai_complete` has no cancellation channel: "stop" abandons the answer rather than stopping
    // the request. What the user asked for is that the box be left alone, and it is.
    let settle: (d: CommitMessageDraft) => void = () => {}
    mockedRun.mockReturnValue(
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
    mockedRun.mockReturnValue(
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
})

describe('useAiGeneration — coverage', () => {
  /** A staged change far too large for the pessimistic default window. */
  function hugeContext(fileCount: number): AiContext {
    const paths = Array.from({ length: fileCount }, (_, i) => `src/f${i}.ts`)
    return {
      ...context,
      diff: paths
        .map(
          (p) =>
            `diff --git a/${p} b/${p}\n--- a/${p}\n+++ b/${p}\n@@ -1 +1 @@\n+${'x'.repeat(6000)}\n`
        )
        .join(''),
      files: paths.map((path) => ({ path, status: 'modified' })),
    }
  }

  it('reports nothing before a generation has been asked for', () => {
    const { result } = renderHook(() => useAiGeneration('/repo'))
    expect(result.current.coverage).toBeNull()
  })

  it('says how much of the staged change the message was written from', async () => {
    mockedGetContext.mockResolvedValue(hugeContext(20))
    const { result } = renderHook(() => useAiGeneration('/repo'))
    await act(async () => {
      await result.current.generate(vi.fn())
    })

    expect(result.current.coverage).toMatchObject({ filesTotal: 20, complete: false })
    expect(result.current.coverage!.filesRead).toBeLessThan(20)
    expect(result.current.coverage!.requiredContextTokens).toBeGreaterThan(4096)
  })

  it('is assessed before the request, not once the answer is back', async () => {
    // A caption that appears after the user has read the subject is a caption they did not get.
    mockedGetContext.mockResolvedValue(hugeContext(20))
    mockedRun.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useAiGeneration('/repo'))

    act(() => {
      void result.current.generate(vi.fn())
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.coverage).not.toBeNull()
    expect(result.current.status).not.toBe('done')
  })

  it('reports a small staged change as fully read', async () => {
    const { result } = renderHook(() => useAiGeneration('/repo'))
    await act(async () => {
      await result.current.generate(vi.fn())
    })
    expect(result.current.coverage).toMatchObject({ complete: true })
  })

  it('clears the previous coverage when a new generation starts', async () => {
    mockedGetContext.mockResolvedValue(hugeContext(20))
    const { result } = renderHook(() => useAiGeneration('/repo'))
    await act(async () => {
      await result.current.generate(vi.fn())
    })
    expect(result.current.coverage).not.toBeNull()

    // A staged change that no longer produces a context is the case that would otherwise leave a
    // stale line captioning a message it never described.
    mockedGetContext.mockResolvedValue({ ...context, diff: '   ' })
    await act(async () => {
      await result.current.generate(vi.fn())
    })
    expect(result.current.coverage).toBeNull()
  })
})
