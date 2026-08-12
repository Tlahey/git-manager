import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useFocusTerminalSession } from './useFocusTerminalSession'
import { useRepoUIStore } from '../stores/repoUI.store'
import { useTerminalStore } from '../stores/terminal.store'

beforeEach(() => {
  useRepoUIStore.setState({ activeRepo: '/repo', activeWorkspacePath: null })
  useTerminalStore.setState({
    open: false,
    height: 260,
    activeId: 'shell',
    sessions: [
      { id: 'shell', title: 'zsh 1', cwd: '/repo' },
      { id: 'agent', title: 'zsh 2', cwd: '/repo/.worktrees/feature' },
    ],
  })
})

describe('useFocusTerminalSession', () => {
  it('enters the worktree the session is bound to, shows it and opens the panel', () => {
    const { result } = renderHook(() => useFocusTerminalSession())
    act(() => result.current('agent', '/repo/.worktrees/feature'))

    expect(useRepoUIStore.getState().activeWorkspacePath).toBe('/repo/.worktrees/feature')
    expect(useTerminalStore.getState().activeId).toBe('agent')
    expect(useTerminalStore.getState().open).toBe(true)
  })

  it('clears the workspace when the session belongs to the repo tab itself', () => {
    useRepoUIStore.setState({ activeWorkspacePath: '/repo/.worktrees/feature' })
    const { result } = renderHook(() => useFocusTerminalSession())
    act(() => result.current('shell', '/repo'))

    expect(useRepoUIStore.getState().activeWorkspacePath).toBeNull()
    expect(useTerminalStore.getState().activeId).toBe('shell')
  })
})
