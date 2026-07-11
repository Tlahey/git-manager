import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { GitBranch } from '@git-manager/git-types'
import { useGroupedBranches } from './useGroupedBranches'

function branch(shortName: string, overrides: Partial<GitBranch> = {}): GitBranch {
  return {
    name: shortName,
    shortName,
    isHead: false,
    isRemote: false,
    commitOid: 'oid',
    commitMessage: 'msg',
    commitTimestamp: 0,
    aheadCount: 0,
    behindCount: 0,
    ...overrides,
  }
}

describe('useGroupedBranches', () => {
  it('groups branches sharing a prefix when at least 2 share it', () => {
    const branches = [branch('feat/a'), branch('feat/b'), branch('main')]
    const { result } = renderHook(() => useGroupedBranches(branches))
    expect(result.current.groups).toEqual([{ prefix: 'feat/', branches: [branches[0], branches[1]] }])
    expect(result.current.ungrouped).toEqual([branches[2]])
  })

  it('leaves a lone-prefix branch ungrouped', () => {
    const branches = [branch('feat/a'), branch('main')]
    const { result } = renderHook(() => useGroupedBranches(branches))
    expect(result.current.groups).toEqual([])
    expect(result.current.ungrouped).toEqual(branches)
  })

  it('ignores remote branches entirely (excluded from both grouping and ungrouped)', () => {
    const branches = [branch('feat/a'), branch('feat/b', { isRemote: true })]
    const { result } = renderHook(() => useGroupedBranches(branches))
    // Only one local branch remains once the remote one is excluded, so "feat/" never reaches
    // the >=2 threshold — it lands in ungrouped rather than disappearing.
    expect(result.current.groups).toEqual([])
    expect(result.current.ungrouped).toEqual([branches[0]])
  })

  it('treats a branch with no slash as ungrouped', () => {
    const branches = [branch('main')]
    const { result } = renderHook(() => useGroupedBranches(branches))
    expect(result.current.ungrouped).toEqual(branches)
  })

  it('does not treat a leading slash as a prefix', () => {
    const branches = [branch('/weird'), branch('/weird2')]
    const { result } = renderHook(() => useGroupedBranches(branches))
    expect(result.current.groups).toEqual([])
    expect(result.current.ungrouped).toEqual(branches)
  })

  it('sorts multiple groups alphabetically by prefix', () => {
    const branches = [branch('fix/a'), branch('fix/b'), branch('chore/a'), branch('chore/b')]
    const { result } = renderHook(() => useGroupedBranches(branches))
    expect(result.current.groups.map((g) => g.prefix)).toEqual(['chore/', 'fix/'])
  })

  it('supports nested-looking prefixes (only the first slash segment counts)', () => {
    const branches = [branch('feat/sub/a'), branch('feat/sub/b')]
    const { result } = renderHook(() => useGroupedBranches(branches))
    expect(result.current.groups[0].prefix).toBe('feat/')
  })
})
