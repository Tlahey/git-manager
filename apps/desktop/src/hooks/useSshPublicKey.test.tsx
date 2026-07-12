import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactNode } from 'react'

vi.mock('../api/ssh.api', () => ({ apiReadSshPublicKey: vi.fn() }))

import { apiReadSshPublicKey } from '../api/ssh.api'
import { useSshPublicKey } from './useSshPublicKey'

const mockedApi = apiReadSshPublicKey as unknown as ReturnType<typeof vi.fn>

function wrapper({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useSshPublicKey', () => {
  it('fetches the public key when path is set', async () => {
    mockedApi.mockResolvedValue('ssh-ed25519 AAAA...')
    const { result } = renderHook(() => useSshPublicKey('/home/me/.ssh/id_ed25519.pub'), {
      wrapper,
    })
    await waitFor(() => expect(result.current.data).toBe('ssh-ed25519 AAAA...'))
    expect(mockedApi).toHaveBeenCalledWith('/home/me/.ssh/id_ed25519.pub')
  })

  it('does not fetch when path is null', () => {
    renderHook(() => useSshPublicKey(null), { wrapper })
    expect(mockedApi).not.toHaveBeenCalled()
  })
})
