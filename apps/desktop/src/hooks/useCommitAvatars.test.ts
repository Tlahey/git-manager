import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const apiGithubCommitAvatars = vi.fn()
vi.mock('../api/github.api', () => ({
  apiGithubCommitAvatars: (...args: unknown[]) => apiGithubCommitAvatars(...args),
}))

const useRepoGitHub = vi.fn()
vi.mock('./useRepoGitHub', () => ({ useRepoGitHub: () => useRepoGitHub() }))

import { useCommitAvatars } from './useCommitAvatars'

beforeEach(() => {
  apiGithubCommitAvatars.mockReset()
  useRepoGitHub.mockReturnValue({ ownerRepo: null, accountId: null })
})

describe('useCommitAvatars', () => {
  it('returns an empty map and skips the API when there is no accountId', () => {
    useRepoGitHub.mockReturnValue({ ownerRepo: { owner: 'owner', repo: 'repo' }, accountId: null })
    const { result } = renderHook(() => useCommitAvatars('/repo', ['sha1']))
    expect(result.current).toEqual({})
    expect(apiGithubCommitAvatars).not.toHaveBeenCalled()
  })

  it('skips the API for a non-GitHub repo even with a accountId', () => {
    useRepoGitHub.mockReturnValue({ ownerRepo: null, accountId: 'acct' })
    const { result } = renderHook(() => useCommitAvatars('/repo', ['sha1']))
    expect(result.current).toEqual({})
    expect(apiGithubCommitAvatars).not.toHaveBeenCalled()
  })

  it('fetches deduplicated SHAs when a accountId and GitHub repo are present', async () => {
    useRepoGitHub.mockReturnValue({
      ownerRepo: { owner: 'owner', repo: 'repo' },
      accountId: 'acct',
    })
    apiGithubCommitAvatars.mockResolvedValue({ sha1: 'https://x/a.png' })
    const { result } = renderHook(() => useCommitAvatars('/repo', ['sha1', 'sha1', 'sha2']))
    await waitFor(() => expect(apiGithubCommitAvatars).toHaveBeenCalled())
    expect(apiGithubCommitAvatars).toHaveBeenCalledWith('acct', 'owner', 'repo', ['sha1', 'sha2'])
    await waitFor(() => expect(result.current).toEqual({ sha1: 'https://x/a.png' }))
  })
})
