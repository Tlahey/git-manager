import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useIsCommitsView } from './useIsCommitsView'
import { useRepoUIStore } from '../stores/repoUI.store'

const INITIAL = useRepoUIStore.getState()

beforeEach(() => {
  useRepoUIStore.setState(INITIAL, true)
})

describe('useIsCommitsView', () => {
  it('is true by default (plain commit graph)', () => {
    const { result } = renderHook(() => useIsCommitsView())
    expect(result.current).toBe(true)
  })

  it('is false when a PR is active', () => {
    useRepoUIStore.setState({ activePrNumber: 42 })
    const { result } = renderHook(() => useIsCommitsView())
    expect(result.current).toBe(false)
  })

  it('is false when a file diff is active', () => {
    useRepoUIStore.setState({ activeDiffFile: { path: 'a.ts', staged: false } })
    const { result } = renderHook(() => useIsCommitsView())
    expect(result.current).toBe(false)
  })

  it('is false when the PR composer is open', () => {
    useRepoUIStore.setState({ prComposer: { head: 'feat', baseRef: 'main', title: 't' } })
    const { result } = renderHook(() => useIsCommitsView())
    expect(result.current).toBe(false)
  })

  it('is false when the PR create view is open', () => {
    useRepoUIStore.setState({ prCreateOpen: true })
    const { result } = renderHook(() => useIsCommitsView())
    expect(result.current).toBe(false)
  })
})
