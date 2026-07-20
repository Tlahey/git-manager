import { describe, it, expect } from 'vitest'
import type { GitGraphNode, GitRef } from '@git-manager/git-types'
import { computeLaneBranchByOid, collectRefDropHighlight } from './laneBranch'

function ref(shortName: string, type: GitRef['type'] = 'branch'): GitRef {
  return { name: `refs/${shortName}`, shortName, type, commitOid: '' }
}

/** Builds a node; `parents` is the ordered parent-oid list (first entry = first parent). */
function node(oid: string, parents: string[] = [], refs: GitRef[] = [], color = '#000'): GitGraphNode {
  return {
    commit: {
      oid,
      shortOid: oid.slice(0, 7),
      message: oid,
      subject: oid,
      body: '',
      author: { name: 'A', email: '', timestamp: 0 },
      committer: { name: 'A', email: '', timestamp: 0 },
      parentOids: parents,
    },
    column: 0,
    color,
    connections: [],
    refs,
  }
}

describe('computeLaneBranchByOid', () => {
  it('attributes a linear history to its single branch tip', () => {
    // c3 (tip: main) → c2 → c1
    const nodes = [node('c3', ['c2'], [ref('main')]), node('c2', ['c1']), node('c1', [])]
    const owner = computeLaneBranchByOid(nodes)
    expect(owner.get('c2')?.shortName).toBe('main')
    expect(owner.get('c1')?.shortName).toBe('main')
  })

  it('keeps main commits on main even when a same-coloured feature tip is newer (the real bug)', () => {
    // feature (newer) and main share the SAME colour (palette reuses main's blue). feature branched
    // off m2: f1 → m2. main is ahead: m3 → m2 → m1.
    const BLUE = '#2563eb'
    const nodes = [
      node('f1', ['m2'], [ref('feature')], BLUE), // feature tip, newest
      node('m3', ['m2'], [ref('main')], BLUE), // main tip (ahead)
      node('m2', ['m1'], [], BLUE),
      node('m1', [], [], BLUE),
    ]
    const owner = computeLaneBranchByOid(nodes)
    // Shared history stays on main (priority 0), not the same-coloured feature.
    expect(owner.get('m2')?.shortName).toBe('main')
    expect(owner.get('m1')?.shortName).toBe('main')
  })

  it('claims a feature branch its own commits down to the branch point', () => {
    // f2 → f1 → m1(main). f1/f2 are feature-only; m1 is shared with main's tip m1.
    const nodes = [
      node('f2', ['f1'], [ref('feature')]),
      node('m1', [], [ref('main')]),
      node('f1', ['m1']),
    ]
    const owner = computeLaneBranchByOid(nodes)
    expect(owner.get('f1')?.shortName).toBe('feature')
    // The branch point m1 is main's tip → owned by main, not feature.
    expect(owner.get('m1')?.shortName).toBe('main')
  })

  it('prefers a local branch over a remote of the same commit', () => {
    const nodes = [node('c2', ['c1'], [ref('origin/x', 'remote'), ref('x')]), node('c1', [])]
    const owner = computeLaneBranchByOid(nodes)
    expect(owner.get('c1')?.shortName).toBe('x')
  })

  it('credits commits merged into main to the branch they came from', () => {
    // merge (main tip) has parents [main-line p1, merged topic tip t1]; t1 → t0.
    const nodes = [
      node('merge', ['p1', 't1'], [ref('main')]),
      node('p1', []),
      node('t1', ['t0'], [ref('topic')]),
      node('t0', []),
    ]
    const owner = computeLaneBranchByOid(nodes)
    // The merge commit and main's first-parent line stay on main.
    expect(owner.get('merge')?.shortName).toBe('main')
    expect(owner.get('p1')?.shortName).toBe('main')
    // The merged-in commits are credited to `topic` (which still points at t1), not main — main only
    // contains them via the merge's second parent, off its first-parent line.
    expect(owner.get('t1')?.shortName).toBe('topic')
    expect(owner.get('t0')?.shortName).toBe('topic')
  })

  it('falls back to main for a merged branch whose ref was deleted', () => {
    // Same shape but the topic tip t1 has no ref (branch merged then deleted). With no branch to
    // credit, the second full-reachability pass attributes the orphaned commits to main.
    const nodes = [
      node('merge', ['p1', 't1'], [ref('main')]),
      node('p1', []),
      node('t1', ['t0']),
      node('t0', []),
    ]
    const owner = computeLaneBranchByOid(nodes)
    expect(owner.get('t1')?.shortName).toBe('main')
    expect(owner.get('t0')?.shortName).toBe('main')
  })

  it('attributes a commit contained in both main and a feature to main', () => {
    // feature is ahead of main: f1 (feature) → m1 (main). m1 is contained in main.
    const nodes = [node('f1', ['m1'], [ref('feature')]), node('m1', [], [ref('main')])]
    const owner = computeLaneBranchByOid(nodes)
    expect(owner.get('m1')?.shortName).toBe('main')
    expect(owner.get('f1')?.shortName).toBe('feature')
  })

  it('picks main when several branches point at the same tip commit (the screenshot bug)', () => {
    // main tip is shared with two claude/* branches (all on the same commit) and origin/main. Its
    // first parent m2 must still be attributed to main, not whichever branch is first in refs.
    const tip = node(
      'm3',
      ['m2'],
      [
        ref('claude/tag-hover'), // listed before main on purpose
        ref('claude/commit-graph'),
        ref('main'),
        ref('origin/main', 'remote'),
      ]
    )
    const nodes = [tip, node('m2', ['m1']), node('m1', [])]
    const owner = computeLaneBranchByOid(nodes)
    expect(owner.get('m2')?.shortName).toBe('main')
    expect(owner.get('m1')?.shortName).toBe('main')
  })

  it('leaves commits with no owning branch tip unmapped', () => {
    const nodes = [node('c2', ['c1']), node('c1', [])]
    expect(computeLaneBranchByOid(nodes).size).toBe(0)
  })
})

describe('collectRefDropHighlight', () => {
  // main:  M2 (tip) → M1 → base ;  feat:  F2 (tip) → F1 → base  (forked at base)
  const nodes = [
    node('F2', ['F1'], [ref('feat')]),
    node('M2', ['M1'], [ref('main')]),
    node('F1', ['base']),
    node('M1', ['base']),
    node('base', []),
  ]
  const owner = computeLaneBranchByOid(nodes)
  const refAt = (shortName: string, type: GitRef['type'], oid: string): GitRef => ({
    name: `refs/${shortName}`,
    shortName,
    type,
    commitOid: oid,
  })

  it('returns null when nothing is hovered', () => {
    expect(collectRefDropHighlight(null, owner)).toBeNull()
  })

  it('highlights only the branch’s own commits, not the shared parent line or children', () => {
    const set = collectRefDropHighlight(refAt('feat', 'branch', 'F2'), owner)
    expect([...set!].sort()).toEqual(['F1', 'F2'])
    expect(set!.has('base')).toBe(false) // shared ancestor belongs to main
    expect(set!.has('M2')).toBe(false)
    expect(set!.has('M1')).toBe(false)
  })

  it('highlights main’s whole first-parent line when hovering main', () => {
    const set = collectRefDropHighlight(refAt('main', 'branch', 'M2'), owner)
    expect([...set!].sort()).toEqual(['M1', 'M2', 'base'])
  })

  it('treats a remote ref the same as its local branch (origin/feat → feat)', () => {
    const set = collectRefDropHighlight(refAt('origin/feat', 'remote', 'F2'), owner)
    expect([...set!].sort()).toEqual(['F1', 'F2'])
  })

  it('attributes a tag to the branch owning the commit it points at', () => {
    const set = collectRefDropHighlight(refAt('v1', 'tag', 'F1'), owner)
    expect([...set!].sort()).toEqual(['F1', 'F2'])
  })

  it('falls back to just the commit for a tag on an unowned commit', () => {
    const orphan = [node('x', [])]
    const set = collectRefDropHighlight(refAt('v1', 'tag', 'x'), computeLaneBranchByOid(orphan))
    expect([...set!]).toEqual(['x'])
  })
})
