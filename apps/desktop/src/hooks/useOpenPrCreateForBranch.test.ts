import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useOpenPrCreateForBranch } from './useOpenPrCreateForBranch'
import { useRepoUIStore } from '../stores/repoUI.store'
import { useRepoViewStore } from '../stores/repoView.store'

beforeEach(() => {
  useRepoUIStore.setState({
    activeRepo: '/repo',
    activeWorkspacePath: null,
    prCreateOpen: false,
    prCreatePrefill: null,
  })
  useRepoViewStore.setState({ view: 'board' })
})

describe('useOpenPrCreateForBranch', () => {
  it('opens the PR-create view prefilled with the branch, no opinion on base', () => {
    const { result } = renderHook(() => useOpenPrCreateForBranch())
    act(() => result.current('feature/x'))

    expect(useRepoUIStore.getState().prCreateOpen).toBe(true)
    expect(useRepoUIStore.getState().prCreatePrefill).toEqual({ head: 'feature/x', base: '' })
  })

  it('jumps to the graph, wherever the view was', () => {
    const { result } = renderHook(() => useOpenPrCreateForBranch())
    act(() => result.current('feature/x'))
    expect(useRepoViewStore.getState().view).toBe('graph')
  })

  it('enters the worktree the branch was worked in, when one is given', () => {
    const { result } = renderHook(() => useOpenPrCreateForBranch())
    act(() => result.current('feature/x', '/repo/.worktrees/feature'))
    expect(useRepoUIStore.getState().activeWorkspacePath).toBe('/repo/.worktrees/feature')
  })

  it('clears the workspace when the worktree path is the repo tab itself', () => {
    useRepoUIStore.setState({ activeWorkspacePath: '/repo/.worktrees/feature' })
    const { result } = renderHook(() => useOpenPrCreateForBranch())
    act(() => result.current('feature/x', '/repo'))
    expect(useRepoUIStore.getState().activeWorkspacePath).toBeNull()
  })

  it('leaves the workspace untouched when no worktree path is given', () => {
    useRepoUIStore.setState({ activeWorkspacePath: '/repo/.worktrees/other' })
    const { result } = renderHook(() => useOpenPrCreateForBranch())
    act(() => result.current('feature/x'))
    expect(useRepoUIStore.getState().activeWorkspacePath).toBe('/repo/.worktrees/other')
  })
})
