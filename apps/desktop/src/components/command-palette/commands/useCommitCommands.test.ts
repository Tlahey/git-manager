import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@git-manager/ui', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const invalidateQueries = vi.fn()
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries }) }))

const { apiCopyCommitSha, apiCherryPickCommit } = vi.hoisted(() => ({
  apiCopyCommitSha: vi.fn(),
  apiCherryPickCommit: vi.fn(),
}))
vi.mock('../../../api/git.api', () => ({ apiCopyCommitSha, apiCherryPickCommit }))

import { useCommitCommands } from './useCommitCommands'
import { useRepoUIStore } from '../../../stores/repoUI.store'

const INITIAL = useRepoUIStore.getState()

beforeEach(() => {
  vi.clearAllMocks()
  useRepoUIStore.setState(INITIAL, true)
  apiCopyCommitSha.mockResolvedValue(undefined)
  apiCherryPickCommit.mockResolvedValue('newoid')
})

function commands() {
  const { result } = renderHook(() => useCommitCommands())
  return result.current
}

describe('useCommitCommands', () => {
  it('returns nothing when no commit is selected', () => {
    expect(commands()).toEqual([])
  })

  it('returns nothing when a commit is selected but there is no active repo', () => {
    useRepoUIStore.setState({ selectedCommitOid: 'deadbeefcafe', activeRepo: null })
    expect(commands()).toEqual([])
  })

  it('returns nothing when the selected row is a stash entry', () => {
    useRepoUIStore.setState({
      selectedCommitOid: 'deadbeefcafe',
      activeRepo: '/repo',
      selectedStashIndex: 0,
    })
    expect(commands()).toEqual([])
  })

  it('returns the commit action set when a commit is selected', () => {
    useRepoUIStore.setState({ selectedCommitOid: 'deadbeefcafe', activeRepo: '/repo' })
    const ids = commands().map((c) => c.id)
    expect(ids).toEqual([
      'commit-reset-soft',
      'commit-reset-mixed',
      'commit-reset-hard',
      'commit-revert',
      'commit-branch',
      'commit-tag',
      'commit-tag-annotated',
      'commit-fixup',
      'commit-cherry-pick',
      'commit-copy-sha',
    ])
  })

  it('dialog commands dispatch the matching pendingGraphAction', () => {
    useRepoUIStore.setState({ selectedCommitOid: 'deadbeefcafe', activeRepo: '/repo' })
    const byId = (id: string) => commands().find((c) => c.id === id)!

    byId('commit-reset-hard').run()
    expect(useRepoUIStore.getState().pendingGraphAction).toEqual({ kind: 'reset', mode: 'hard' })

    byId('commit-revert').run()
    expect(useRepoUIStore.getState().pendingGraphAction).toEqual({ kind: 'revert' })

    byId('commit-tag-annotated').run()
    expect(useRepoUIStore.getState().pendingGraphAction).toEqual({ kind: 'tag', annotated: true })

    byId('commit-branch').run()
    expect(useRepoUIStore.getState().pendingGraphAction).toEqual({ kind: 'branch' })

    byId('commit-fixup').run()
    expect(useRepoUIStore.getState().pendingGraphAction).toEqual({ kind: 'fixup' })
  })

  it('copy-sha copies the full selected oid', () => {
    useRepoUIStore.setState({ selectedCommitOid: 'deadbeefcafe', activeRepo: '/repo' })
    commands()
      .find((c) => c.id === 'commit-copy-sha')!
      .run()
    expect(apiCopyCommitSha).toHaveBeenCalledWith('deadbeefcafe')
  })

  it('cherry-pick calls the API directly and invalidates log/status on success', async () => {
    useRepoUIStore.setState({ selectedCommitOid: 'deadbeefcafe', activeRepo: '/repo' })
    commands()
      .find((c) => c.id === 'commit-cherry-pick')!
      .run()
    expect(apiCherryPickCommit).toHaveBeenCalledWith('/repo', 'deadbeefcafe')
    await vi.waitFor(() => {
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['git-log', '/repo'] })
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['git-status', '/repo'] })
    })
  })
})
