import { describe, it, expect } from 'vitest'
import type { GitBranch } from '@git-manager/git-types'
import {
  buildLocalSection,
  buildRemotesSection,
  buildTagsSection,
  buildStashesSection,
  buildSubmodulesSection,
  buildWorktreesSection,
  remoteOf,
  TAGS_LIMIT,
} from './sidebarGitSections'

const t = ((key: string, opts?: Record<string, unknown>) =>
  opts ? `${key}:${JSON.stringify(opts)}` : key) as never
const ctx = (over: Partial<{ q: string; isOpen: boolean }> = {}) => ({
  t,
  q: '',
  isOpen: true,
  subOpen: (_id: string, def = true) => def,
  ...over,
})

function branch(name: string, over: Partial<GitBranch> = {}): GitBranch {
  const isRemote = name.includes('/') && !name.startsWith('feat/')
  return {
    name,
    shortName: isRemote ? name.split('/').slice(1).join('/') : name,
    isRemote,
    isHead: false,
    commitOid: `oid-${name}`,
    ...over,
  } as GitBranch
}

const notSelected = () => false
const ids = (section: { rows: { id: string }[] } | null) => section?.rows.map((r) => r.id)

/**
 * The rule the six builders share, and the one that is easy to get wrong: *which* kind of empty
 * hides a section. Three answers, one per group, and each is a deliberate product decision rather
 * than an accident of how the list was built.
 */
describe('when a section hides itself', () => {
  it('drops Tags, Stashes and Submodules as soon as they are empty', () => {
    expect(buildTagsSection(ctx(), { tags: [], selectedCommitOid: null })).toBeNull()
    expect(buildStashesSection(ctx(), { stashes: [], selectedBranch: null })).toBeNull()
    expect(buildSubmodulesSection(ctx(), { submodules: [] })).toBeNull()
  })

  /** A repo always has a local branch, so an empty Local can only mean the search matched none. */
  it('keeps Local when unfiltered and empty, and drops it only under a search', () => {
    const data = { pinnedBranches: [], remainingBranches: [], count: 0, isSelected: notSelected }
    expect(buildLocalSection(ctx(), data)).not.toBeNull()
    expect(buildLocalSection(ctx({ q: 'zzz' }), data)).toBeNull()
  })

  /**
   * Worktrees follows Local rather than Tags, for a different reason: its header carries the "add"
   * action, so hiding it with zero worktrees would make creating the first one unreachable.
   */
  it('keeps Worktrees when empty, saying so, and drops it only under a search', () => {
    const empty = buildWorktreesSection(ctx(), { worktrees: [] })
    expect(ids(empty)).toEqual(['wt:empty'])
    expect(empty?.count).toBeUndefined()
    expect(buildWorktreesSection(ctx({ q: 'zzz' }), { worktrees: [] })).toBeNull()
  })

  /** Remotes goes with Tags: a repo with no remote genuinely has no such section. */
  it('drops Remotes when there is no remote at all', () => {
    expect(buildRemotesSection(ctx(), { groups: [], count: 0, isSelected: notSelected })).toBeNull()
  })
})

describe('a closed section', () => {
  /** Collapsed, it still reports its count — the header is what the user clicks to reopen it. */
  it('builds no rows but keeps its header and count', () => {
    const s = buildStashesSection(ctx({ isOpen: false }), {
      stashes: [{ index: 0, message: 'wip', branch: 'main', commitOid: 'c1' }] as never,
      selectedBranch: null,
    })
    expect(s?.rows).toEqual([])
    expect(s?.count).toBe(1)
    expect(s?.isOpen).toBe(false)
  })
})

describe('buildLocalSection', () => {
  it('lists the pinned branches first, separated from the rest', () => {
    const s = buildLocalSection(ctx(), {
      pinnedBranches: [branch('main')],
      remainingBranches: [branch('feat/a')],
      count: 2,
      isSelected: notSelected,
    })
    expect(ids(s)?.[0]).toBe('local:main')
    expect(ids(s)).toContain('div:pinned')
  })

  /** No divider with nothing on one of its sides — it separates two lists, not a list from itself. */
  it('omits the divider when only one of the two lists has anything in it', () => {
    const onlyPinned = buildLocalSection(ctx(), {
      pinnedBranches: [branch('main')],
      remainingBranches: [],
      count: 1,
      isSelected: notSelected,
    })
    expect(ids(onlyPinned)).not.toContain('div:pinned')
  })
})

describe('buildTagsSection', () => {
  const tags = Array.from({ length: TAGS_LIMIT + 5 }, (_, i) => ({
    name: `refs/tags/v${i}`,
    shortName: `v${i}`,
    type: 'tag' as const,
    commitOid: `oid-${i}`,
  }))

  /** Past the cap the list stops and says how many are left, rather than silently truncating. */
  it('caps the list and names the remainder', () => {
    const s = buildTagsSection(ctx(), { tags, selectedCommitOid: null })
    expect(s?.rows).toHaveLength(TAGS_LIMIT + 1)
    expect(ids(s)?.at(-1)).toBe('tag:more')
    // The header still counts every tag, capped list or not.
    expect(s?.count).toBe(tags.length)
  })

  /** A tag follows the *commit* selection, since clicking one scrolls the graph to its commit. */
  it('selects the tag pointing at the selected commit', () => {
    const s = buildTagsSection(ctx(), { tags: tags.slice(0, 2), selectedCommitOid: 'oid-1' })
    expect(s?.rows.map((r) => 'isSelected' in r && r.isSelected)).toEqual([false, true])
  })
})

describe('remoteOf', () => {
  /**
   * Read from `name`, never `shortName`: the backend strips the remote from the latter, so
   * splitting the short name would name the remote after the branch's first folder — which is what
   * once put `build` and `feat` beside `origin` instead of inside it.
   */
  it('takes the remote from the qualified name, not from the folder', () => {
    expect(remoteOf(branch('origin/build/ci'))).toBe('origin')
    expect(remoteOf(branch('upstream/main'))).toBe('upstream')
  })

  it('falls back to origin for an unqualified name', () => {
    expect(remoteOf(branch('main'))).toBe('origin')
  })
})
