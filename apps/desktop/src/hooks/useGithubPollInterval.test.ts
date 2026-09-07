import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useGithubPollInterval } from './useGithubPollInterval'
import { useGithubRateLimitStore } from '../stores/githubRateLimit.store'
import type { GithubRateBucket } from '../lib/githubRateLimit'

function setBucket(key: string, over: Partial<GithubRateBucket>) {
  useGithubRateLimitStore.setState({
    buckets: {
      [key]: {
        limit: 5000,
        remaining: 5000,
        reset: Math.floor(Date.now() / 1000) + 3600,
        blockedUntil: null,
        ...over,
      },
    },
  })
}

beforeEach(() => {
  useGithubRateLimitStore.setState({ buckets: {} })
})

describe('useGithubPollInterval', () => {
  it('hands back the caller base interval when nothing is known', () => {
    // A healthy session must poll exactly as often as it did before any of this existed.
    const { result } = renderHook(() => useGithubPollInterval(60_000, 'octocat', 'core'))
    expect(result.current).toBe(60_000)
  })

  it('slows the poll down as the allowance runs out', () => {
    setBucket('octocat:core', { remaining: 600 })
    const { result } = renderHook(() => useGithubPollInterval(60_000, 'octocat', 'core'))
    expect(result.current).toBe(240_000)
  })

  it('stops polling while the bucket is blocked', () => {
    setBucket('octocat:core', { remaining: 0, blockedUntil: Date.now() + 60_000 })
    const { result } = renderHook(() => useGithubPollInterval(60_000, 'octocat', 'core'))
    expect(result.current).toBe(0)
  })

  it('takes the most constrained of the buckets a refresh spends from', () => {
    // The dashboard's refresh is a search, then a REST call per pull request, then a GraphQL query —
    // and a refresh whose *first* call would be refused has nothing to gain from firing.
    useGithubRateLimitStore.setState({
      buckets: {
        'octocat:core': { limit: 5000, remaining: 5000, reset: 0, blockedUntil: null },
        'octocat:search': { limit: 30, remaining: 2, reset: 0, blockedUntil: null },
      },
    })
    const { result } = renderHook(() =>
      useGithubPollInterval(60_000, 'octocat', ['core', 'search'])
    )
    expect(result.current).toBe(480_000)
  })

  it('resumes on its own when the cooldown lapses, with nothing else happening', async () => {
    // Nothing writes to the store when a deadline passes, and with every poller stopped there is no
    // response left to learn from — so without the hook own timer the app would never restart.
    vi.useFakeTimers()
    try {
      setBucket('octocat:core', { remaining: 0, blockedUntil: Date.now() + 30_000 })
      const { result } = renderHook(() => useGithubPollInterval(60_000, 'octocat', 'core'))
      expect(result.current).toBe(0)

      await act(async () => {
        vi.advanceTimersByTime(31_000)
      })
      expect(result.current).toBeGreaterThan(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps one account cooldown off another account poll', () => {
    setBucket('hubot:core', { remaining: 0, blockedUntil: Date.now() + 60_000 })
    const { result } = renderHook(() => useGithubPollInterval(60_000, 'octocat', 'core'))
    expect(result.current).toBe(60_000)
  })
})
