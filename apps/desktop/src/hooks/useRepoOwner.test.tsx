import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactNode } from 'react'

vi.mock('../api/git.api', () => ({ apiGetRemotes: vi.fn() }))

import { apiGetRemotes } from '../api/git.api'
import { useRepoOwner } from './useRepoOwner'

const mockedApi = apiGetRemotes as unknown as ReturnType<typeof vi.fn>

function wrapper({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useRepoOwner', () => {
  it('resolves the owner from the origin remote', async () => {
    mockedApi.mockResolvedValue([{ name: 'origin', url: 'git@github.com:Tlahey/git-manager.git' }])
    const { result } = renderHook(() => useRepoOwner('/repo'), { wrapper })
    await waitFor(() => expect(result.current.remote?.owner).toBe('Tlahey'))
    expect(result.current.remote?.host).toBe('github.com')
    expect(result.current.url).toBe('git@github.com:Tlahey/git-manager.git')
  })

  it('prefers origin over other remotes regardless of order', async () => {
    mockedApi.mockResolvedValue([
      { name: 'upstream', url: 'https://github.com/upstream-org/git-manager.git' },
      { name: 'origin', url: 'https://github.com/Tlahey/git-manager.git' },
    ])
    const { result } = renderHook(() => useRepoOwner('/repo'), { wrapper })
    await waitFor(() => expect(result.current.remote?.owner).toBe('Tlahey'))
  })

  it('falls back to the first parsable remote when there is no origin', async () => {
    mockedApi.mockResolvedValue([
      { name: 'local', url: '/srv/git/app.git' },
      { name: 'fork', url: 'https://gitlab.com/team/app.git' },
    ])
    const { result } = renderHook(() => useRepoOwner('/repo'), { wrapper })
    await waitFor(() => expect(result.current.remote?.owner).toBe('team'))
    expect(result.current.url).toBe('https://gitlab.com/team/app.git')
  })

  it('resolves to null when no remote carries an owner', async () => {
    mockedApi.mockResolvedValue([{ name: 'origin', url: '/srv/git/app.git' }])
    const { result } = renderHook(() => useRepoOwner('/repo'), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.remote).toBeNull()
    expect(result.current.url).toBeNull()
  })

  it('resolves to null when the repo has no remotes', async () => {
    mockedApi.mockResolvedValue([])
    const { result } = renderHook(() => useRepoOwner('/repo'), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.remote).toBeNull()
  })

  it('does not fetch when path is null', () => {
    renderHook(() => useRepoOwner(null), { wrapper })
    expect(mockedApi).not.toHaveBeenCalled()
  })
})
