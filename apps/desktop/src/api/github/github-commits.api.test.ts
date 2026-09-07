import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/tauri', () => ({ githubApiRequest: vi.fn() }))

import { githubApiRequest } from '../../lib/tauri'
import { fetchCommitAvatars } from './github-commits.api'
import { clearGithubAvatarCache } from '../../lib/githubAvatarCache'
import { useGithubRateLimitStore } from '../../stores/githubRateLimit.store'

const requested = vi.mocked(githubApiRequest)

/** One GraphQL reply, built from the `sha → avatar` map the fake repository should answer with. */
function graphqlReply(shas: string[], avatars: Record<string, string>) {
  const repository: Record<string, unknown> = {}
  shas.forEach((sha, i) => {
    repository[`c${i}`] = avatars[sha] ? { author: { user: { avatarUrl: avatars[sha] } } } : null
  })
  return {
    status: 200,
    ok: true,
    body: JSON.stringify({ data: { repository } }),
    sso: null,
    tokenExpiresAt: null,
    rateLimit: null,
    retryAfterSecs: null,
    fromCache: false,
  } as Awaited<ReturnType<typeof githubApiRequest>>
}

/** The SHAs a captured GraphQL call actually asked about, read back off its variables. */
function askedShas(call: number): string[] {
  const body = requested.mock.calls[call]?.[0].body as { variables: Record<string, unknown> }
  return Object.entries(body.variables)
    .filter(([k]) => k.startsWith('oid'))
    .sort((a, b) => Number(a[0].slice(3)) - Number(b[0].slice(3)))
    .map(([, v]) => v as string)
}

beforeEach(() => {
  vi.clearAllMocks()
  clearGithubAvatarCache()
  useGithubRateLimitStore.setState({ buckets: {} })
})

describe('fetchCommitAvatars', () => {
  it('answers a hundred commits in one request, where the old command sent a hundred', () => {
    // The fix this file exists for: opening a blame gutter used to be one REST call per commit.
    const shas = Array.from({ length: 100 }, (_, i) => `sha${i}`)
    requested.mockImplementation(async (input) => {
      const body = input.body as { variables: Record<string, string> }
      void body
      return graphqlReply(shas, { sha0: 'https://x/0.png', sha99: 'https://x/99.png' })
    })

    return fetchCommitAvatars('octocat', 'acme', 'app', shas).then((avatars) => {
      expect(requested).toHaveBeenCalledTimes(1)
      expect(avatars).toEqual({ sha0: 'https://x/0.png', sha99: 'https://x/99.png' })
    })
  })

  it('splits a larger blame into chunks rather than one enormous document', async () => {
    const shas = Array.from({ length: 250 }, (_, i) => `sha${i}`)
    requested.mockImplementation(async () => graphqlReply([], {}))
    await fetchCommitAvatars('octocat', 'acme', 'app', shas)
    expect(requested).toHaveBeenCalledTimes(3)
    expect(askedShas(0)).toHaveLength(100)
    expect(askedShas(2)).toHaveLength(50)
  })

  it('asks only about the commits it has not already resolved', async () => {
    // Scrolling the gutter by one line changes the caller SWR key; without the cache that is a
    // whole new fetch of commits resolved a moment ago.
    requested.mockResolvedValue(graphqlReply(['a', 'b'], { a: 'https://x/a.png' }))
    await fetchCommitAvatars('octocat', 'acme', 'app', ['a', 'b'])
    requested.mockClear()

    requested.mockResolvedValue(graphqlReply(['c'], { c: 'https://x/c.png' }))
    const second = await fetchCommitAvatars('octocat', 'acme', 'app', ['a', 'b', 'c'])
    expect(askedShas(0)).toEqual(['c'])
    // …and the cached one is still in the answer, not dropped for having been cheap.
    expect(second).toEqual({ a: 'https://x/a.png', c: 'https://x/c.png' })
  })

  it('sends nothing at all when every commit is already known', async () => {
    requested.mockResolvedValue(graphqlReply(['a'], { a: 'https://x/a.png' }))
    await fetchCommitAvatars('octocat', 'acme', 'app', ['a'])
    requested.mockClear()

    await expect(fetchCommitAvatars('octocat', 'acme', 'app', ['a', 'a'])).resolves.toEqual({
      a: 'https://x/a.png',
    })
    expect(requested).not.toHaveBeenCalled()
  })

  it('passes each SHA as a variable, never interpolated into the document', async () => {
    requested.mockResolvedValue(graphqlReply(['a'], {}))
    await fetchCommitAvatars('octocat', 'acme', 'app', ['a'])
    const input = requested.mock.calls[0][0] as { body: { query: string; variables: unknown } }
    expect(input.body.query).not.toContain('"a"')
    expect(input.body.variables).toMatchObject({ owner: 'acme', repo: 'app', oid0: 'a' })
  })

  it('keeps the photos it did resolve when a later chunk fails', async () => {
    // Decoration, never the reason the view exists: some photos beat none.
    const shas = Array.from({ length: 150 }, (_, i) => `sha${i}`)
    requested
      .mockResolvedValueOnce(graphqlReply(shas.slice(0, 100), { sha0: 'https://x/0.png' }))
      .mockRejectedValueOnce(new Error('network'))
    await expect(fetchCommitAvatars('octocat', 'acme', 'app', shas)).resolves.toEqual({
      sha0: 'https://x/0.png',
    })
  })

  it('goes through the shared transport, so it feeds the quota store it used to bypass', async () => {
    requested.mockResolvedValue({
      ...graphqlReply(['a'], {}),
      rateLimit: { limit: 5000, remaining: 4900, reset: 0, resource: 'graphql' },
    })
    await fetchCommitAvatars('octocat', 'acme', 'app', ['a'])
    expect(useGithubRateLimitStore.getState().buckets['octocat:graphql']).toMatchObject({
      remaining: 4900,
    })
  })
})
