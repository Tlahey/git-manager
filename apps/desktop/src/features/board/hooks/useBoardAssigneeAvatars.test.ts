import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const { useAssignableUsers } = vi.hoisted(() => ({
  useAssignableUsers: vi.fn(() => ({ users: [] as { login: string; avatar_url: string }[], isLoading: false })),
}))
vi.mock('../../../hooks/usePrEditCandidates', () => ({ useAssignableUsers }))

import { useBoardAssigneeAvatars } from './useBoardAssigneeAvatars'

beforeEach(() => {
  useAssignableUsers.mockReturnValue({ users: [], isLoading: false })
})

describe('useBoardAssigneeAvatars', () => {
  it('resolves a picture for a known collaborator', () => {
    useAssignableUsers.mockReturnValue({
      users: [{ login: 'ada', avatar_url: 'https://example.test/ada.png' }],
      isLoading: false,
    })
    const { result } = renderHook(() => useBoardAssigneeAvatars('/repo'))
    expect(result.current('ada')).toBe('https://example.test/ada.png')
  })

  /** A local board's assignee is free text someone typed, so the casing is theirs, not GitHub's. */
  it('matches a login regardless of case', () => {
    useAssignableUsers.mockReturnValue({
      users: [{ login: 'Ada', avatar_url: 'https://example.test/ada.png' }],
      isLoading: false,
    })
    const { result } = renderHook(() => useBoardAssigneeAvatars('/repo'))
    expect(result.current('ADA')).toBe('https://example.test/ada.png')
  })

  /** The normal case on a local board, where the assignee is a person's name and not a login — the
   * card then draws coloured initials rather than nothing. */
  it('resolves nothing for a name no collaborator goes by', () => {
    const { result } = renderHook(() => useBoardAssigneeAvatars('/repo'))
    expect(result.current('Ada Lovelace')).toBeUndefined()
  })

  it('keeps the same function across renders, so the cards do not all re-render', () => {
    const { result, rerender } = renderHook(() => useBoardAssigneeAvatars('/repo'))
    const first = result.current
    rerender()
    expect(result.current).toBe(first)
  })
})
