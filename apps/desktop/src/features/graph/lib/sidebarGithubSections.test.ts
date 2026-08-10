import { describe, it, expect } from 'vitest'
import { buildPrSection, buildIssueSection } from './sidebarGithubSections'

const t = ((key: string) => key) as never
const ctx = { t, q: '', isOpen: true, subOpen: (_id: string, def = true) => def }

const prData = {
  groups: [],
  count: 0,
  isGithub: true,
  isConnected: true,
  loading: false,
  selectedBranch: null,
}
const issueData = { groups: [], count: 0, isGithub: true, isConnected: true, loading: false }

const ids = (section: { rows: { id: string }[] } | null) => section?.rows.map((r) => r.id)

/**
 * The order of these three checks is the thing worth pinning. Nothing is fetched without a token,
 * so "signed out" has to be reported before "loading" and before "no saved filters" — otherwise a
 * signed-out user is told their filters matched nothing, which is a lie about a state that never
 * ran.
 */
describe('reachability states, in order', () => {
  it('reports a non-GitHub repo before anything else', () => {
    const s = buildPrSection(ctx, { ...prData, isGithub: false, isConnected: false, loading: true })
    expect(ids(s)).toEqual(['pr:nogithub'])
  })

  it('reports being signed out before loading', () => {
    const s = buildPrSection(ctx, { ...prData, isConnected: false, loading: true })
    expect(ids(s)).toEqual(['pr:noaccount'])
  })

  it('reports loading before "no saved filters"', () => {
    const s = buildPrSection(ctx, { ...prData, loading: true })
    expect(ids(s)).toEqual(['pr:loading'])
  })

  it('applies the same order to the issues section', () => {
    expect(ids(buildIssueSection(ctx, { ...issueData, isGithub: false }))).toEqual([
      'issue:nogithub',
    ])
    expect(
      ids(buildIssueSection(ctx, { ...issueData, isConnected: false, loading: true }))
    ).toEqual(['issue:noaccount'])
  })
})

describe('hiding on a search that matched nothing', () => {
  /** A filter that matched nothing hides the section — that is about *matching*. */
  it('hides the section when a search matched nothing', () => {
    expect(buildPrSection({ ...ctx, q: 'zzz' }, prData)).toBeNull()
    expect(buildIssueSection({ ...ctx, q: 'zzz' }, issueData)).toBeNull()
  })

  /** The reachability states are not about matching, so a search must never hide them. */
  it('keeps a signed-out or loading section visible even while searching', () => {
    expect(buildPrSection({ ...ctx, q: 'zzz' }, { ...prData, isConnected: false })).not.toBeNull()
    expect(buildPrSection({ ...ctx, q: 'zzz' }, { ...prData, loading: true })).not.toBeNull()
    expect(buildPrSection({ ...ctx, q: 'zzz' }, { ...prData, isGithub: false })).not.toBeNull()
  })

  it('keeps the section when nothing is being searched for', () => {
    expect(buildPrSection(ctx, prData)).not.toBeNull()
  })
})

describe('the closed section', () => {
  /** Collapsed, it still reports its count — the header is what the user clicks to reopen it. */
  it('builds no rows but keeps its header', () => {
    const s = buildPrSection({ ...ctx, isOpen: false }, { ...prData, count: 3 })
    expect(s?.rows).toEqual([])
    expect(s?.count).toBe(3)
    expect(s?.isOpen).toBe(false)
  })
})
