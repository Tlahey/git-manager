import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/tauri', () => ({ githubApiRequest: vi.fn() }))

import { githubApiRequest } from '../../lib/tauri'
import { fetchPullRequestGroups, searchExpression } from './github-pr-search.api'
import { useGithubRateLimitStore } from '../../stores/githubRateLimit.store'

const requested = vi.mocked(githubApiRequest)

function envelope(body: unknown, ok = true, status = 200) {
  return {
    status,
    ok,
    body: JSON.stringify(body),
    sso: null,
    tokenExpiresAt: null,
    rateLimit: null,
    retryAfterSecs: null,
    fromCache: false,
  } as Awaited<ReturnType<typeof githubApiRequest>>
}

/** One GraphQL `PullRequest` node, in the shape the v4 search returns. */
function node(number: number, over: Record<string, unknown> = {}) {
  return {
    number,
    title: `PR ${number}`,
    body: 'body',
    url: `https://github.com/acme/app/pull/${number}`,
    state: 'OPEN',
    isDraft: false,
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
    headRefName: 'feature',
    baseRefName: 'main',
    author: { login: 'octocat', avatarUrl: 'https://x/o.png' },
    labels: { nodes: [{ name: 'bug' }] },
    assignees: { nodes: [{ login: 'hubot', avatarUrl: 'https://x/h.png' }] },
    reviewRequests: {
      nodes: [{ requestedReviewer: { login: 'reviewer', avatarUrl: 'https://x/r.png' } }],
    },
    ...over,
  }
}

/** A GraphQL reply whose aliases answer in the given order. */
function graphqlReply(perAlias: Array<Array<ReturnType<typeof node>>>) {
  const data: Record<string, unknown> = {}
  perAlias.forEach((nodes, i) => {
    data[`f${i}`] = { nodes }
  })
  return envelope({ data })
}

/** The GraphQL variables of the request at `call`. */
function variablesOf(call: number): Record<string, string> {
  const body = requested.mock.calls[call]?.[0].body as { variables: Record<string, string> }
  return body.variables
}

beforeEach(() => {
  vi.clearAllMocks()
  useGithubRateLimitStore.setState({ buckets: {} })
})

describe('fetchPullRequestGroups', () => {
  it('answers every saved filter in a single request', async () => {
    // The point of the whole file: this was one `search/issues` call per filter, against the
    // thirty-a-minute search allowance.
    requested.mockResolvedValue(graphqlReply([[node(1)], [node(2)], [node(3)]]))

    const groups = await fetchPullRequestGroups(
      'acme',
      'app',
      ['is:open author:me', 'is:open review-requested:me', 'is:closed'],
      'octocat'
    )

    expect(requested).toHaveBeenCalledTimes(1)
    expect(requested.mock.calls[0][0].url).toBe('https://api.github.com/graphql')
    expect(groups.map((g) => g.prs[0]?.number)).toEqual([1, 2, 3])
  })

  it('scopes each filter to its repository, exactly as the REST path did', async () => {
    requested.mockResolvedValue(graphqlReply([[]]))
    await fetchPullRequestGroups('acme', 'app', ['is:open'], 'octocat')
    expect(variablesOf(0).q0).toBe('repo:acme/app is:pr is:open')
    // Both paths must build the same expression, or a fallback would change what the sidebar shows.
    expect(searchExpression('acme', 'app', 'is:open')).toBe('repo:acme/app is:pr is:open')
  })

  it('returns groups in the order asked, so a caller can zip them onto its filters', async () => {
    requested.mockResolvedValue(graphqlReply([[node(7)], []]))
    const groups = await fetchPullRequestGroups('acme', 'app', ['first', 'second'], 'octocat')
    expect(groups.map((g) => g.query)).toEqual(['first', 'second'])
    expect(groups[1].prs).toEqual([])
  })

  it('maps a merged pull request from the state GraphQL reports outright', async () => {
    // REST reports `closed` plus a `merged_at` that has to be read to tell the two apart; GraphQL
    // says MERGED. The precedence must still match, or the two paths disagree.
    requested.mockResolvedValue(
      graphqlReply([[node(1, { state: 'MERGED', isDraft: false }), node(2, { isDraft: true })]])
    )
    const [group] = await fetchPullRequestGroups('acme', 'app', ['q'], 'octocat')
    expect(group.prs.map((p) => p.state)).toEqual(['merged', 'draft'])
  })

  it('fills the head and base branches the REST search could not', async () => {
    // `search/issues` returns the *issue* representation of a PR, which carries no head/base.
    requested.mockResolvedValue(graphqlReply([[node(1)]]))
    const [group] = await fetchPullRequestGroups('acme', 'app', ['q'], 'octocat')
    expect(group.prs[0].headRef).toBe('feature')
    expect(group.prs[0].baseRef).toBe('main')
  })

  it('carries the participants the sidebar groups on', async () => {
    requested.mockResolvedValue(graphqlReply([[node(1)]]))
    const [group] = await fetchPullRequestGroups('acme', 'app', ['q'], 'octocat')
    expect(group.prs[0].assignees).toEqual([{ login: 'hubot', avatarUrl: 'https://x/h.png' }])
    expect(group.prs[0].requestedReviewers).toEqual([
      { login: 'reviewer', avatarUrl: 'https://x/r.png' },
    ])
    expect(group.prs[0].labels).toEqual(['bug'])
  })

  it('survives a pull request GitHub answered thinly', async () => {
    // A deleted author is a real state ("ghost"), and every connection can come back null.
    requested.mockResolvedValue(
      graphqlReply([
        [
          node(1, {
            author: null,
            labels: null,
            assignees: null,
            reviewRequests: null,
            body: null,
          }),
        ],
      ])
    )
    const [group] = await fetchPullRequestGroups('acme', 'app', ['q'], 'octocat')
    expect(group.prs[0].author).toBe('—')
    expect(group.prs[0].labels).toEqual([])
    expect(group.prs[0].body).toBe('')
  })

  it('falls back to one search per filter when the bulk query fails', async () => {
    // One query means one failure, and a saved filter is user-written text — bad syntax is a normal
    // state. Each group must keep carrying its own error rather than all going down together.
    requested.mockImplementation(async (input) => {
      if (input.url.includes('/graphql')) return envelope({ errors: [{ message: 'bad query' }] })
      if (input.url.includes('good')) return envelope({ items: [{ number: 5, state: 'open' }] })
      return envelope({ message: 'Validation Failed' }, false, 422)
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const groups = await fetchPullRequestGroups('acme', 'app', ['good', 'bad'], 'octocat')

    expect(groups[0].prs.map((p) => p.number)).toEqual([5])
    expect(groups[0].error).toBeNull()
    expect(groups[1].prs).toEqual([])
    expect(groups[1].error).toContain('422')
    expect(warn).toHaveBeenCalled()
  })

  it('uses the REST path for an anonymous caller, since GraphQL requires a token', async () => {
    requested.mockResolvedValue(envelope({ items: [] }))
    await fetchPullRequestGroups('acme', 'app', ['is:open'])
    expect(requested.mock.calls[0][0].url).toContain('search/issues')
  })

  it('splits an implausible number of filters rather than building one giant query', async () => {
    requested.mockImplementation(async () => graphqlReply(Array.from({ length: 12 }, () => [])))
    await fetchPullRequestGroups(
      'acme',
      'app',
      Array.from({ length: 13 }, (_, i) => `q${i}`),
      'octocat'
    )
    expect(requested).toHaveBeenCalledTimes(2)
  })

  it('sends nothing when there are no filters', async () => {
    await expect(fetchPullRequestGroups('acme', 'app', [], 'octocat')).resolves.toEqual([])
    expect(requested).not.toHaveBeenCalled()
  })

  it('is billed to the graphql allowance, not the tight search one', async () => {
    // The second half of the win: `search` is thirty a *minute*, and it is the bucket the sidebar
    // was most likely to exhaust.
    requested.mockResolvedValue({
      ...graphqlReply([[]]),
      rateLimit: { limit: 5000, remaining: 4990, reset: 0, resource: 'graphql' },
    })
    await fetchPullRequestGroups('acme', 'app', ['q'], 'octocat')
    const { buckets } = useGithubRateLimitStore.getState()
    expect(buckets['octocat:graphql']).toMatchObject({ remaining: 4990 })
    expect(buckets['octocat:search']).toBeUndefined()
  })
})
