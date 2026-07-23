import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactNode } from 'react'

const { fetchGitHubPRDetails } = vi.hoisted(() => ({ fetchGitHubPRDetails: vi.fn() }))
vi.mock('../api/github.api', () => ({ fetchGitHubPRDetails }))

import { useSettingsStore } from '../stores/settings.store'
import { usePrOverview } from './usePrOverview'

const DEFAULT_SETTINGS = useSettingsStore.getState().settings

function wrapper({ children }: { children: ReactNode }) {
  return <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
}

function withToken() {
  useSettingsStore.setState({
    settings: {
      ...DEFAULT_SETTINGS,
      github: {
        accounts: [
          {
            id: 'acc1',
            token: 'tok',
            user: { login: 'me', name: null, email: null, avatarUrl: '' },
          },
        ],
        activeAccountId: 'acc1',
      },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS })
})

describe('usePrOverview', () => {
  it('returns an empty body and never fetches when signed out', () => {
    const { result } = renderHook(() => usePrOverview('owner/repo', 7), { wrapper })
    expect(result.current.body).toBe('')
    expect(fetchGitHubPRDetails).not.toHaveBeenCalled()
  })

  it('fetches the PR body from the right endpoint when signed in', async () => {
    withToken()
    fetchGitHubPRDetails.mockResolvedValue({ body: '## Hello\nworld' })
    const { result } = renderHook(() => usePrOverview('owner/repo', 7), { wrapper })
    await waitFor(() => expect(result.current.body).toBe('## Hello\nworld'))
    expect(fetchGitHubPRDetails).toHaveBeenCalledWith(
      'https://api.github.com/repos/owner/repo/pulls/7',
      'tok'
    )
  })

  it('does not fetch when the PR has no owner/repo', () => {
    withToken()
    renderHook(() => usePrOverview(undefined, 7), { wrapper })
    expect(fetchGitHubPRDetails).not.toHaveBeenCalled()
  })
})
