import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { RebaseState } from '@git-manager/git-types'

vi.mock('../api/git.api', () => ({ apiGetRebaseState: vi.fn() }))

import { apiGetRebaseState } from '../api/git.api'
import { useRebaseGraphView } from './useRebaseGraphView'
import { useRebaseViewStore } from '../stores/rebaseView.store'

const mockedApi = apiGetRebaseState as unknown as ReturnType<typeof vi.fn>

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function rebaseState(overrides: Partial<RebaseState> = {}): RebaseState {
  return { kind: 'idle', steps: [], ...overrides }
}

beforeEach(() => {
  vi.clearAllMocks()
  useRebaseViewStore.setState({ views: {} })
})

describe('useRebaseGraphView', () => {
  it('reports no rebase in progress when idle', async () => {
    mockedApi.mockResolvedValue(rebaseState({ kind: 'idle' }))
    const { result } = renderHook(() => useRebaseGraphView('/repo'), { wrapper })
    await waitFor(() => expect(result.current.rebaseState).toBeDefined())

    expect(result.current.isRebasePaused).toBe(false)
    expect(result.current.isRebasing).toBe(false)
    expect(result.current.conflictInfo).toBeNull()
    expect(result.current.rebaseViewOpen).toBe(false)
  })

  it('builds conflictInfo and opens the rebase view when paused on a conflict', async () => {
    mockedApi.mockResolvedValue(
      rebaseState({
        kind: 'conflict',
        conflictedFiles: ['a.ts', 'b.ts'],
        branchName: 'feat',
        currentStep: 2,
        totalSteps: 5,
      })
    )
    const { result } = renderHook(() => useRebaseGraphView('/repo'), { wrapper })
    await waitFor(() => expect(result.current.isRebasePaused).toBe(true))

    expect(result.current.conflictInfo).toEqual({
      count: 2,
      branchName: 'feat',
      currentStep: 2,
      totalSteps: 5,
    })
    expect(result.current.isRebasing).toBe(true)
    expect(result.current.rebaseViewOpen).toBe(true)
  })

  it('also takes over the view while mid-apply (in_progress), with no conflict info', async () => {
    mockedApi.mockResolvedValue(rebaseState({ kind: 'in_progress' }))
    const { result } = renderHook(() => useRebaseGraphView('/repo'), { wrapper })
    await waitFor(() => expect(result.current.isRebasing).toBe(true))

    expect(result.current.isRebasePaused).toBe(false)
    expect(result.current.conflictInfo).toBeNull()
    expect(result.current.rebaseViewOpen).toBe(true)
  })

  it('respects a dismissed progress view (rebaseViewOpen false) while still rebasing', async () => {
    useRebaseViewStore.setState({
      views: { '/repo': { progressHidden: true, filesHidden: false } },
    })
    mockedApi.mockResolvedValue(rebaseState({ kind: 'conflict' }))
    const { result } = renderHook(() => useRebaseGraphView('/repo'), { wrapper })
    await waitFor(() => expect(result.current.isRebasing).toBe(true))

    expect(result.current.rebaseViewOpen).toBe(false)
  })

  it('forgets the dismissal once the repo stops rebasing', async () => {
    useRebaseViewStore.setState({
      views: { '/repo': { progressHidden: true, filesHidden: false } },
    })
    mockedApi.mockResolvedValue(rebaseState({ kind: 'idle' }))
    renderHook(() => useRebaseGraphView('/repo'), { wrapper })

    await waitFor(() =>
      expect(useRebaseViewStore.getState().views['/repo']?.progressHidden).toBeUndefined()
    )
  })
})
