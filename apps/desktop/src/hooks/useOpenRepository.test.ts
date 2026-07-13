import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { GitRepo } from '@git-manager/git-types'

const { openMock, apiOpenRepo } = vi.hoisted(() => ({ openMock: vi.fn(), apiOpenRepo: vi.fn() }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: openMock }))
vi.mock('../api/repo.api', () => ({ apiOpenRepo }))

import { useOpenRepository } from './useOpenRepository'
import { useRepoDataStore } from '../stores/repoData.store'
import { useRepoUIStore } from '../stores/repoUI.store'

const REPO = { path: '/repo/x', name: 'x', head: 'main', isDetached: false } as unknown as GitRepo

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useOpenRepository', () => {
  it('returns false and does nothing when the picker is cancelled', async () => {
    openMock.mockResolvedValue(null)
    const addRepo = vi.spyOn(useRepoDataStore.getState(), 'addRepo')
    const openTab = vi.spyOn(useRepoUIStore.getState(), 'openTab')

    const { result } = renderHook(() => useOpenRepository())
    await expect(result.current()).resolves.toBe(false)

    expect(apiOpenRepo).not.toHaveBeenCalled()
    expect(addRepo).not.toHaveBeenCalled()
    expect(openTab).not.toHaveBeenCalled()
  })

  it('opens the chosen repo and adds it as a tab', async () => {
    openMock.mockResolvedValue('/repo/x')
    apiOpenRepo.mockResolvedValue(REPO)
    const addRepo = vi.spyOn(useRepoDataStore.getState(), 'addRepo')
    const openTab = vi.spyOn(useRepoUIStore.getState(), 'openTab')

    const { result } = renderHook(() => useOpenRepository())
    await expect(result.current()).resolves.toBe(true)

    expect(apiOpenRepo).toHaveBeenCalledWith('/repo/x')
    expect(addRepo).toHaveBeenCalledWith(REPO)
    expect(openTab).toHaveBeenCalledWith('/repo/x')
  })
})
