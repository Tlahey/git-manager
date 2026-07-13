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
  useRepoGitHub.mockReturnValue({ ownerRepo: null, token: null })
})

describe('useCommitAvatars', () => {
  it('returns an empty map and skips the API when there is no token', () => {
    useRepoGitHub.mockReturnValue({ ownerRepo: { owner: 'owner', repo: 'repo' }, token: null })
    const { result } = renderHook(() => useCommitAvatars('/repo', ['sha1']))
    expect(result.current).toEqual({})
    expect(apiGithubCommitAvatars).not.toHaveBeenCalled()
  })

  it('skips the API for a non-GitHub repo even with a token', () => {
    useRepoGitHub.mockReturnValue({ ownerRepo: null, token: 'tok' })
    const { result } = renderHook(() => useCommitAvatars('/repo', ['sha1']))
    expect(result.current).toEqual({})
    expect(apiGithubCommitAvatars).not.toHaveBeenCalled()
  })

  it('fetches deduplicated SHAs when a token and GitHub repo are present', async () => {
    useRepoGitHub.mockReturnValue({ ownerRepo: { owner: 'owner', repo: 'repo' }, token: 'tok' })
    apiGithubCommitAvatars.mockResolvedValue({ sha1: 'https://x/a.png' })
    const { result } = renderHook(() => useCommitAvatars('/repo', ['sha1', 'sha1', 'sha2']))
    await waitFor(() => expect(apiGithubCommitAvatars).toHaveBeenCalled())
    expect(apiGithubCommitAvatars).toHaveBeenCalledWith('tok', 'owner', 'repo', ['sha1', 'sha2'])
    await waitFor(() => expect(result.current).toEqual({ sha1: 'https://x/a.png' }))
  })
})
