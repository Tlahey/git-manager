import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactNode } from 'react'

const apiTerminalStatus = vi.fn()
vi.mock('../api/terminal.api', () => ({
  apiTerminalStatus: () => apiTerminalStatus(),
}))

import { useTerminalActivity } from './useTerminalActivity'
import { useTerminalStore } from '../stores/terminal.store'

const wrapper = ({ children }: { children: ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
)

beforeEach(() => {
  apiTerminalStatus.mockReset()
  apiTerminalStatus.mockResolvedValue([])
  useTerminalStore.setState({ open: false, height: 260, sessions: [], activeId: null })
})

describe('useTerminalActivity', () => {
  it('asks the backend nothing while there is no session', async () => {
    const { result } = renderHook(() => useTerminalActivity(), { wrapper })
    await waitFor(() => expect(result.current).toEqual({}))
    expect(apiTerminalStatus).not.toHaveBeenCalled()
  })

  it('keys the statuses by session id', async () => {
    useTerminalStore.setState({
      sessions: [
        { id: 'a', title: 'zsh 1', cwd: '/repo' },
        { id: 'b', title: 'zsh 2', cwd: '/repo' },
      ],
      activeId: 'a',
    })
    apiTerminalStatus.mockResolvedValue([
      { id: 'a', busy: true, command: 'claude' },
      { id: 'b', busy: false, command: null },
    ])

    const { result } = renderHook(() => useTerminalActivity(), { wrapper })
    await waitFor(() => expect(result.current.a?.busy).toBe(true))
    expect(result.current.a?.command).toBe('claude')
    expect(result.current.b?.busy).toBe(false)
  })
})
