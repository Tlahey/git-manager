import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const { swrMutate } = vi.hoisted(() => ({ swrMutate: vi.fn() }))
vi.mock('swr', () => ({ mutate: swrMutate }))
vi.mock('../api/git.api', () => ({
  apiRebaseAbort: vi.fn(),
  apiRebaseContinue: vi.fn(),
  apiRebaseSkip: vi.fn(),
}))

import { apiRebaseAbort, apiRebaseContinue, apiRebaseSkip } from '../api/git.api'
import { useRebaseControls } from './useRebaseControls'

const mockedAbort = apiRebaseAbort as unknown as ReturnType<typeof vi.fn>
const mockedContinue = apiRebaseContinue as unknown as ReturnType<typeof vi.fn>
const mockedSkip = apiRebaseSkip as unknown as ReturnType<typeof vi.fn>

function setup(onStepFinished?: () => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(() => useRebaseControls('/repo', { onStepFinished }), { wrapper })
  return { result, invalidate }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedAbort.mockResolvedValue(undefined)
  mockedContinue.mockResolvedValue(undefined)
  mockedSkip.mockResolvedValue(undefined)
})

describe('useRebaseControls', () => {
  it('starts idle', () => {
    const { result } = setup()
    expect(result.current.pending).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('passes an amended message through to continue, and omits it otherwise', async () => {
    const { result } = setup()
    await act(async () => {
      await result.current.continueRebase('reworded subject')
    })
    expect(mockedContinue).toHaveBeenCalledWith('/repo', 'reworded subject')

    await act(async () => {
      await result.current.continueRebase()
    })
    expect(mockedContinue).toHaveBeenLastCalledWith('/repo', undefined)
  })

  // A rebase step moves HEAD, so anything derived from it is stale — see the hook's doc comment.
  it('invalidates the rebase state, working tree and log after a control runs', async () => {
    const { result, invalidate } = setup()
    await act(async () => {
      await result.current.skipStep()
    })
    const keys = invalidate.mock.calls.map((call) => call[0]?.queryKey)
    expect(keys).toEqual(
      expect.arrayContaining([
        ['rebase-state', '/repo'],
        ['git-status', '/repo'],
        ['git-log', '/repo'],
      ])
    )
    expect(swrMutate).toHaveBeenCalledWith(['conflicted-files', '/repo'])
    expect(swrMutate).toHaveBeenCalledWith(['rebase-state', '/repo'])
  })

  it('notifies the caller when continue or abort ends the step, but not on skip', async () => {
    const onStepFinished = vi.fn()
    const { result } = setup(onStepFinished)

    await act(async () => {
      await result.current.skipStep()
    })
    expect(onStepFinished).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.continueRebase()
    })
    await act(async () => {
      await result.current.abortRebase()
    })
    expect(onStepFinished).toHaveBeenCalledTimes(2)
  })

  it('reports which control is in flight and clears it when done', async () => {
    let release: (() => void) | undefined
    mockedAbort.mockReturnValue(
      new Promise<void>((resolve) => {
        release = resolve
      })
    )
    const { result } = setup()

    act(() => {
      void result.current.abortRebase()
    })
    await waitFor(() => expect(result.current.pending).toBe('abort'))

    await act(async () => {
      release?.()
    })
    await waitFor(() => expect(result.current.pending).toBeNull())
  })

  it('keeps a failure on screen and does not run the step-finished callback', async () => {
    const onStepFinished = vi.fn()
    mockedContinue.mockRejectedValue(new Error('could not apply'))
    const { result, invalidate } = setup(onStepFinished)

    await act(async () => {
      await result.current.continueRebase()
    })
    expect(result.current.error).toContain('could not apply')
    expect(result.current.pending).toBeNull()
    expect(onStepFinished).not.toHaveBeenCalled()
    // A failed control changed nothing, so nothing needs refetching either.
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('clears a previous error when the next control runs', async () => {
    mockedContinue.mockRejectedValueOnce(new Error('boom'))
    const { result } = setup()
    await act(async () => {
      await result.current.continueRebase()
    })
    expect(result.current.error).toContain('boom')

    await act(async () => {
      await result.current.continueRebase()
    })
    expect(result.current.error).toBeNull()
  })
})
