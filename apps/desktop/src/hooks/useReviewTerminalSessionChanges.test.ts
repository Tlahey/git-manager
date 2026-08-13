import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useReviewTerminalSessionChanges } from './useReviewTerminalSessionChanges'
import { useRepoUIStore } from '../stores/repoUI.store'
import { useTerminalStore } from '../stores/terminal.store'
import { useRepoViewStore } from '../stores/repoView.store'

beforeEach(() => {
  useRepoUIStore.setState({ activeRepo: '/repo', activeWorkspacePath: null, aiPanelTarget: null })
  useRepoViewStore.setState({ view: 'board' })
  useTerminalStore.setState({
    open: false,
    height: 260,
    activeId: 'shell',
    sessions: [
      { id: 'shell', title: 'zsh 1', cwd: '/repo' },
      { id: 'agent', title: 'zsh 2', cwd: '/repo/.worktrees/feature' },
    ],
    finished: { agent: { command: 'claude' } },
  })
})

describe('useReviewTerminalSessionChanges', () => {
  it('enters the worktree, jumps to the graph and opens the working-tree review', () => {
    const { result } = renderHook(() => useReviewTerminalSessionChanges())
    act(() => result.current('agent', '/repo/.worktrees/feature'))

    expect(useRepoUIStore.getState().activeWorkspacePath).toBe('/repo/.worktrees/feature')
    expect(useRepoViewStore.getState().view).toBe('graph')
    expect(useRepoUIStore.getState().aiPanelTarget).toEqual({ kind: 'reviewWorking' })
  })

  it('clears the workspace when the session belongs to the repo tab itself', () => {
    useRepoUIStore.setState({ activeWorkspacePath: '/repo/.worktrees/feature' })
    const { result } = renderHook(() => useReviewTerminalSessionChanges())
    act(() => result.current('shell', '/repo'))

    expect(useRepoUIStore.getState().activeWorkspacePath).toBeNull()
  })

  it('marks the session seen — asking for a review is dealing with what finished', () => {
    const { result } = renderHook(() => useReviewTerminalSessionChanges())
    expect(useTerminalStore.getState().finished).toHaveProperty('agent')

    act(() => result.current('agent', '/repo/.worktrees/feature'))
    expect(useTerminalStore.getState().finished).not.toHaveProperty('agent')
  })
})
