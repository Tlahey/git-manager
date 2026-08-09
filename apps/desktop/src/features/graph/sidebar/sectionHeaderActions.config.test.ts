import { describe, it, expect, vi } from 'vitest'
import {
  SECTION_HEADER_ACTIONS,
  resolveSectionHeaderActions,
  type SectionHeaderActionHandlers,
} from './sectionHeaderActions.config'

function allHandlers(): SectionHeaderActionHandlers {
  return {
    onCreateBranch: vi.fn(),
    onPruneBranches: vi.fn(),
    onRemoveMergedBranches: vi.fn(),
    onRemoveMyMergedBranches: vi.fn(),
    onAddWorktree: vi.fn(),
    onPruneWorktrees: vi.fn(),
    onRemoveMergedWorktrees: vi.fn(),
    onRemoveMyMergedWorktrees: vi.fn(),
    onCreatePr: vi.fn(),
    onCreateIssue: vi.fn(),
    onAddIssueFilter: vi.fn(),
    onAddPrFilter: vi.fn(),
  }
}

describe('SECTION_HEADER_ACTIONS', () => {
  it('lists no duplicate action keys within a single section', () => {
    for (const keys of Object.values(SECTION_HEADER_ACTIONS)) {
      expect(new Set(keys).size).toBe(keys?.length)
    }
  })

  it('never assigns the same action key to two different sections', () => {
    const seen = new Map<string, string>()
    for (const [section, keys] of Object.entries(SECTION_HEADER_ACTIONS)) {
      for (const key of keys ?? []) {
        expect(seen.has(key), `"${key}" claimed by both "${seen.get(key)}" and "${section}"`).toBe(
          false
        )
        seen.set(key, section)
      }
    }
  })
})

/** Keys whose resolved value is defined (i.e. actions the section actually owns) — every other
 *  key is still present on the result, explicitly set to `undefined`. */
function definedKeys(resolved: SectionHeaderActionHandlers): string[] {
  return Object.entries(resolved)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key)
}

describe('resolveSectionHeaderActions', () => {
  it('only leaves the action keys the section owns defined; every other key is present but undefined', () => {
    const resolved = resolveSectionHeaderActions('local', allHandlers())
    expect(definedKeys(resolved).sort()).toEqual(
      [
        'onCreateBranch',
        'onPruneBranches',
        'onRemoveMergedBranches',
        'onRemoveMyMergedBranches',
      ].sort()
    )
    expect(resolved.onAddWorktree).toBeUndefined()
    expect('onAddWorktree' in resolved).toBe(true)
  })

  it('resolves the worktree actions for the worktrees section', () => {
    const resolved = resolveSectionHeaderActions('worktrees', allHandlers())
    expect(definedKeys(resolved).sort()).toEqual(
      [
        'onAddWorktree',
        'onPruneWorktrees',
        'onRemoveMergedWorktrees',
        'onRemoveMyMergedWorktrees',
      ].sort()
    )
  })

  it('returns no defined actions for a section with none configured (e.g. remotes)', () => {
    expect(definedKeys(resolveSectionHeaderActions('remotes', allHandlers()))).toEqual([])
  })

  it('leaves an already-gated handler as-is (undefined stays undefined)', () => {
    const { onCreatePr: _omitted, ...handlers } = allHandlers()
    const resolved = resolveSectionHeaderActions('prs', handlers)
    expect(resolved.onCreatePr).toBeUndefined()
    expect(resolved.onAddPrFilter).toBe(handlers.onAddPrFilter)
  })

  it('does not leak an action into a section that does not own it', () => {
    const resolved = resolveSectionHeaderActions('issues', allHandlers())
    expect(resolved.onCreateBranch).toBeUndefined()
    expect(resolved.onAddWorktree).toBeUndefined()
  })
})
