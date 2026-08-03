import { describe, it, expect } from 'vitest'
import { resolveGithubUrl } from './githubUrls'

const OWNER_REPO = { owner: 'owner', repo: 'repo' }

describe('resolveGithubUrl', () => {
  it('prefers the first known URL over guessing one', () => {
    expect(
      resolveGithubUrl('pull', OWNER_REPO, 7, 'https://github.enterprise.test/owner/repo/pull/7')
    ).toBe('https://github.enterprise.test/owner/repo/pull/7')
  })

  it('falls through several known URLs to the first non-empty one', () => {
    expect(
      resolveGithubUrl(
        'issues',
        OWNER_REPO,
        7,
        null,
        undefined,
        'https://github.com/owner/repo/issues/7'
      )
    ).toBe('https://github.com/owner/repo/issues/7')
  })

  it('guesses a github.com URL from ownerRepo when no known URL is given', () => {
    expect(resolveGithubUrl('pull', OWNER_REPO, 7)).toBe('https://github.com/owner/repo/pull/7')
  })

  it('builds an /issues/ URL for issues and a /pull/ URL for pull requests', () => {
    expect(resolveGithubUrl('issues', OWNER_REPO, 7)).toBe('https://github.com/owner/repo/issues/7')
  })

  it('gives up when ownerRepo is not resolved yet, instead of guessing from a local path', () => {
    expect(resolveGithubUrl('pull', null, 7)).toBeUndefined()
  })
})
