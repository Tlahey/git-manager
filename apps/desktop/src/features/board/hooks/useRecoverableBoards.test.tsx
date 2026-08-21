import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactNode } from 'react'
import { makeBoard, makeRecoverableBoard } from '../test/boardFactories'

vi.mock('../api/local-board.api', () => ({
  apiListRecoverableBoards: vi.fn(),
  apiRestoreBoardBackup: vi.fn(),
}))

import { apiListRecoverableBoards, apiRestoreBoardBackup } from '../api/local-board.api'
import { useRecoverableBoards } from './useRecoverableBoards'

const mockedList = apiListRecoverableBoards as unknown as ReturnType<typeof vi.fn>
const mockedRestore = apiRestoreBoardBackup as unknown as ReturnType<typeof vi.fn>

function wrapper({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useRecoverableBoards', () => {
  it('lists boards recoverable from the disaster-recovery mirror', async () => {
    const board = makeRecoverableBoard({ id: 'b1' }, 3)
    mockedList.mockResolvedValue([board])
    const setActiveBoard = vi.fn()
    const revalidateLists = vi.fn()

    const { result } = renderHook(
      () => useRecoverableBoards({ repoPath: '/repo', setActiveBoard, revalidateLists }),
      { wrapper }
    )

    await waitFor(() => expect(result.current.recoverableBoards).toEqual([board]))
    expect(mockedList).toHaveBeenCalledWith('/repo')
  })

  it('is empty when nothing needs recovering', async () => {
    mockedList.mockResolvedValue([])
    const { result } = renderHook(
      () =>
        useRecoverableBoards({
          repoPath: '/repo',
          setActiveBoard: vi.fn(),
          revalidateLists: vi.fn(),
        }),
      { wrapper }
    )

    await waitFor(() => expect(result.current.recoverableBoardsLoading).toBe(false))
    expect(result.current.recoverableBoards).toEqual([])
  })

  it('restores a board, refreshes both lists, and jumps to it', async () => {
    mockedList.mockResolvedValue([makeRecoverableBoard({ id: 'b1' })])
    const restored = makeBoard({ id: 'b1' })
    mockedRestore.mockResolvedValue(restored)
    const setActiveBoard = vi.fn()
    const revalidateLists = vi.fn()

    const { result } = renderHook(
      () => useRecoverableBoards({ repoPath: '/repo', setActiveBoard, revalidateLists }),
      { wrapper }
    )
    await waitFor(() => expect(result.current.recoverableBoards).toHaveLength(1))

    await act(async () => {
      await result.current.restoreBoard('b1')
    })

    expect(mockedRestore).toHaveBeenCalledWith('/repo', 'b1')
    expect(revalidateLists).toHaveBeenCalled()
    expect(setActiveBoard).toHaveBeenCalledWith('b1')
  })
})
