import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useGithubRateLimitWarning } from './useGithubRateLimitWarning'
import { useGithubRateLimitStore } from '../stores/githubRateLimit.store'

const warning = vi.hoisted(() => vi.fn())
vi.mock('@git-manager/ui', () => ({ toast: { warning } }))

function block(key: string, minutes: number) {
  useGithubRateLimitStore.setState({
    buckets: {
      [key]: {
        limit: 5000,
        remaining: 0,
        reset: Math.floor(Date.now() / 1000) + minutes * 60,
        blockedUntil: Date.now() + minutes * 60_000,
      },
    },
  })
}

beforeEach(() => {
  warning.mockClear()
  useGithubRateLimitStore.setState({ buckets: {} })
})

describe('useGithubRateLimitWarning', () => {
  it('stays quiet while every allowance is answering', () => {
    useGithubRateLimitStore.setState({
      buckets: {
        'octocat:core': { limit: 5000, remaining: 12, reset: 0, blockedUntil: null },
      },
    })
    renderHook(() => useGithubRateLimitWarning())
    expect(warning).not.toHaveBeenCalled()
  })

  it('says GitHub has stopped answering, and roughly for how long', () => {
    // The failure this exists for: several callers turn a 403 into an empty list, so a spent quota
    // used to look exactly like a repository with nothing in it.
    block('octocat:core', 19)
    renderHook(() => useGithubRateLimitWarning())
    expect(warning).toHaveBeenCalledTimes(1)
    const [title, options] = warning.mock.calls[0] as [string, { description: string }]
    expect(title).toBe('GitHub rate limit reached')
    expect(options.description).toContain('19 minutes')
    expect(options.description).toContain('core')
  })

  it('speaks once per block, however many times it re-renders', () => {
    block('octocat:search', 5)
    const { rerender } = renderHook(() => useGithubRateLimitWarning())
    rerender()
    rerender()
    expect(warning).toHaveBeenCalledTimes(1)
  })

  it('speaks again for a later block, having gone quiet in between', () => {
    block('octocat:core', 5)
    const { rerender } = renderHook(() => useGithubRateLimitWarning())
    expect(warning).toHaveBeenCalledTimes(1)

    useGithubRateLimitStore.setState({ buckets: {} })
    rerender()
    expect(warning).toHaveBeenCalledTimes(1)

    block('octocat:core', 12)
    rerender()
    expect(warning).toHaveBeenCalledTimes(2)
  })
})
