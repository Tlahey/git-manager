import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient } from '@tanstack/react-query'

vi.mock('../api/repo.api', () => ({ apiOpenRepo: vi.fn() }))

import { apiOpenRepo } from '../api/repo.api'
import { useRepoDataStore } from '../stores/repoData.store'
import { refreshAfterHeadMove } from './repoRefresh'

const mockedOpen = apiOpenRepo as unknown as ReturnType<typeof vi.fn>

/** Only the fields this function moves around; `apiOpenRepo`'s real shape is much wider. */
function summary(head: string) {
  return { path: '/repo', head, isDetached: false } as unknown as Awaited<
    ReturnType<typeof apiOpenRepo>
  >
}

beforeEach(() => {
  vi.clearAllMocks()
  useRepoDataStore.setState({ repoCache: {} })
})

describe('refreshAfterHeadMove', () => {
  it('re-reads the repository and puts the fresh summary in the cache', async () => {
    mockedOpen.mockResolvedValue(summary('card/exporter'))
    const queryClient = new QueryClient()

    await refreshAfterHeadMove(queryClient, '/repo')

    expect(mockedOpen).toHaveBeenCalledWith('/repo')
    expect(useRepoDataStore.getState().repoCache['/repo']?.head).toBe('card/exporter')
  })

  /**
   * The three keys are the branch list, the graph and the working tree — the views that describe
   * where HEAD is. Asserted by key rather than by "something was invalidated": dropping one of them
   * is exactly the bug this exists for, and it would leave the other two right.
   */
  it('invalidates the branch list, the log and the status of that repository', async () => {
    mockedOpen.mockResolvedValue(summary('main'))
    const queryClient = new QueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await refreshAfterHeadMove(queryClient, '/repo')

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['branches', '/repo'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['git-log', '/repo'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['git-status', '/repo'] })
  })

  it("leaves another repository's queries alone", async () => {
    mockedOpen.mockResolvedValue(summary('main'))
    const queryClient = new QueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await refreshAfterHeadMove(queryClient, '/repo')

    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['branches', '/other'] })
  })

  // The queries are what actually put the views right, so a failed read of the summary must not
  // take them down with it.
  it('still invalidates when the repository cannot be re-read', async () => {
    mockedOpen.mockRejectedValue(new Error('locked'))
    const queryClient = new QueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await expect(refreshAfterHeadMove(queryClient, '/repo')).resolves.toBeUndefined()

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['branches', '/repo'] })
    expect(useRepoDataStore.getState().repoCache['/repo']).toBeUndefined()
  })
})
