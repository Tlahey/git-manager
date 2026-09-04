import { describe, it, expect } from 'vitest'
import {
  resolveGithubDetailState,
  describeGithubDetailFailure,
  type GithubDetailStateInput,
} from './githubDetailState'

function input(overrides: Partial<GithubDetailStateInput> = {}): GithubDetailStateInput {
  return {
    enabled: true,
    accountId: 'octocat',
    ownerRepo: { owner: 'org', repo: 'repo' },
    isResolvingRemotes: false,
    remotesError: undefined,
    isFetching: false,
    fetchError: undefined,
    ...overrides,
  }
}

describe('resolveGithubDetailState', () => {
  it('is idle when nothing is selected', () => {
    expect(resolveGithubDetailState(input({ enabled: false, isFetching: true }))).toEqual({
      isLoading: false,
      failure: undefined,
    })
  })

  it('loads while the remotes lookup is still in flight', () => {
    expect(resolveGithubDetailState(input({ ownerRepo: null, isResolvingRemotes: true }))).toEqual({
      isLoading: true,
      failure: undefined,
    })
  })

  it('reports the remotes error ahead of anything derived from it', () => {
    const cause = new Error('not a repository')
    expect(resolveGithubDetailState(input({ ownerRepo: null, remotesError: cause }))).toEqual({
      isLoading: false,
      failure: { reason: 'remotes', cause },
    })
  })

  it('distinguishes "no GitHub remote" from "no account"', () => {
    expect(resolveGithubDetailState(input({ ownerRepo: null })).failure).toEqual({
      reason: 'no-github-remote',
    })
    expect(resolveGithubDetailState(input({ accountId: null })).failure).toEqual({
      reason: 'no-account',
    })
  })

  // The regression this module exists for: with a null SWR key nothing is in flight and nothing
  // errored, so a panel gating on `isLoading || !data` would spin forever on a falsy pair.
  it('never returns "loading with no failure" when the fetch could not start', () => {
    for (const overrides of [{ ownerRepo: null }, { accountId: null }]) {
      const state = resolveGithubDetailState(input(overrides))
      expect(state.isLoading).toBe(false)
      expect(state.failure).toBeDefined()
    }
  })

  it('passes the fetch through once every prerequisite is resolved', () => {
    expect(resolveGithubDetailState(input({ isFetching: true }))).toEqual({
      isLoading: true,
      failure: undefined,
    })
    const cause = new Error('GitHub API 404')
    expect(resolveGithubDetailState(input({ fetchError: cause })).failure).toEqual({
      reason: 'fetch',
      cause,
    })
  })
})

describe('describeGithubDetailFailure', () => {
  it('surfaces an Error message and a non-empty string cause', () => {
    expect(describeGithubDetailFailure({ reason: 'fetch', cause: new Error('boom') })).toBe('boom')
    expect(describeGithubDetailFailure({ reason: 'remotes', cause: 'raw failure' })).toBe(
      'raw failure'
    )
  })

  it('has nothing to add for the causeless reasons, or for an empty cause', () => {
    expect(describeGithubDetailFailure({ reason: 'no-account' })).toBeUndefined()
    expect(describeGithubDetailFailure({ reason: 'no-github-remote' })).toBeUndefined()
    expect(describeGithubDetailFailure({ reason: 'fetch', cause: '   ' })).toBeUndefined()
  })
})
