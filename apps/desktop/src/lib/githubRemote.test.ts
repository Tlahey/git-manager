import { describe, it, expect } from 'vitest'
import { parseGitHubUrl, firstGitHubOwnerRepo } from './githubRemote'

describe('parseGitHubUrl', () => {
  it('parses an HTTPS URL with .git suffix', () => {
    expect(parseGitHubUrl('https://github.com/owner/repo.git')).toEqual({
      owner: 'owner',
      repo: 'repo',
    })
  })

  it('parses an SSH URL', () => {
    expect(parseGitHubUrl('git@github.com:owner/repo.git')).toEqual({
      owner: 'owner',
      repo: 'repo',
    })
  })

  it('returns null for a non-GitHub remote', () => {
    expect(parseGitHubUrl('https://gitlab.com/owner/repo.git')).toBeNull()
  })
})

describe('firstGitHubOwnerRepo', () => {
  it('returns the first GitHub remote among several', () => {
    expect(
      firstGitHubOwnerRepo(['https://gitlab.com/x/y.git', 'git@github.com:a/b.git'])
    ).toEqual({ owner: 'a', repo: 'b' })
  })

  it('returns null when no remote is GitHub', () => {
    expect(firstGitHubOwnerRepo(['https://gitlab.com/x/y.git'])).toBeNull()
  })

  it('returns null for an empty list', () => {
    expect(firstGitHubOwnerRepo([])).toBeNull()
  })
})
