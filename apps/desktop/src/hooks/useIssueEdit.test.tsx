import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactNode } from 'react'

vi.mock('../api/github.api', () => ({ updateIssue: vi.fn() }))
vi.mock('./useRepoGitHub', () => ({ useRepoGitHub: vi.fn() }))
vi.mock('@git-manager/ui', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { updateIssue } from '../api/github.api'
import { useRepoGitHub } from './useRepoGitHub'
import { toast } from '@git-manager/ui'
import { useIssueEdit } from './useIssueEdit'

const m = {
  updateIssue: updateIssue as unknown as ReturnType<typeof vi.fn>,
  useRepoGitHub: useRepoGitHub as unknown as ReturnType<typeof vi.fn>,
  toastError: toast.error as unknown as ReturnType<typeof vi.fn>,
}

function wrapper({ children }: { children: ReactNode }) {
  return <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
}

beforeEach(() => {
  vi.clearAllMocks()
  m.updateIssue.mockResolvedValue({ number: 7 })
})

describe('useIssueEdit', () => {
  it('is not editable when signed out', () => {
    m.useRepoGitHub.mockReturnValue({ ownerRepo: null, token: null })
    const { result } = renderHook(() => useIssueEdit('org/repo', 7), { wrapper })
    expect(result.current.canEdit).toBe(false)
  })

  it('patches the issue when editable', async () => {
    m.useRepoGitHub.mockReturnValue({ ownerRepo: { owner: 'org', repo: 'repo' }, token: 'tok' })
    const { result } = renderHook(() => useIssueEdit('org/repo', 7), { wrapper })
    expect(result.current.canEdit).toBe(true)
    await act(async () => {
      await result.current.update({ title: 'New title' })
    })
    expect(m.updateIssue).toHaveBeenCalledWith('org', 'repo', 7, { title: 'New title' }, 'tok')
  })

  it('surfaces a failure as an error toast and rethrows', async () => {
    m.useRepoGitHub.mockReturnValue({ ownerRepo: { owner: 'org', repo: 'repo' }, token: 'tok' })
    m.updateIssue.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useIssueEdit('org/repo', 7), { wrapper })
    await expect(
      act(async () => {
        await result.current.update({ body: 'x' })
      })
    ).rejects.toThrow()
    expect(m.toastError).toHaveBeenCalled()
  })
})
