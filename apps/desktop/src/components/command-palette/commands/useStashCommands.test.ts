import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@git-manager/ui', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const invalidateQueries = vi.fn()
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries }) }))

const swrMutate = vi.fn()
vi.mock('swr', () => ({ mutate: (...a: unknown[]) => swrMutate(...a) }))

const { apiStashApply, apiStashPop, apiStashDrop } = vi.hoisted(() => ({
  apiStashApply: vi.fn(),
  apiStashPop: vi.fn(),
  apiStashDrop: vi.fn(),
}))
vi.mock('../../../api/git.api', () => ({ apiStashApply, apiStashPop, apiStashDrop }))

import { useStashCommands } from './useStashCommands'
import { useRepoUIStore } from '../../../stores/repoUI.store'

const INITIAL = useRepoUIStore.getState()

beforeEach(() => {
  vi.clearAllMocks()
  useRepoUIStore.setState(INITIAL, true)
  apiStashApply.mockResolvedValue(undefined)
  apiStashPop.mockResolvedValue(undefined)
  apiStashDrop.mockResolvedValue(undefined)
})

function commands() {
  const { result } = renderHook(() => useStashCommands())
  return result.current
}

describe('useStashCommands', () => {
  it('returns nothing when no stash row is selected', () => {
    expect(commands()).toEqual([])
  })

  it('returns nothing when a stash index is selected but there is no active repo', () => {
    useRepoUIStore.setState({ selectedStashIndex: 0, activeRepo: null })
    expect(commands()).toEqual([])
  })

  it('returns apply/pop/drop when a stash row is selected', () => {
    useRepoUIStore.setState({ selectedStashIndex: 1, activeRepo: '/repo' })
    expect(commands().map((c) => c.id)).toEqual(['stash-apply', 'stash-pop', 'stash-drop'])
  })

  it('apply/pop/drop call the matching API with the selected index and refresh log/status/stashes', async () => {
    useRepoUIStore.setState({ selectedStashIndex: 2, activeRepo: '/repo' })
    const byId = (id: string) => commands().find((c) => c.id === id)!

    byId('stash-apply').run()
    expect(apiStashApply).toHaveBeenCalledWith('/repo', 2)
    await vi.waitFor(() => expect(swrMutate).toHaveBeenCalledWith(['git-stashes', '/repo']))
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['git-log', '/repo'] })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['git-status', '/repo'] })

    byId('stash-pop').run()
    await vi.waitFor(() => expect(apiStashPop).toHaveBeenCalledWith('/repo', 2))

    byId('stash-drop').run()
    await vi.waitFor(() => expect(apiStashDrop).toHaveBeenCalledWith('/repo', 2))
  })
})
