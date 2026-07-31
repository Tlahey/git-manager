import { describe, it, expect } from 'vitest'
import { DEV_FIXTURES_AVAILABLE, loadDevFixtures } from './devFixtures'

describe('loadDevFixtures', () => {
  it('is available under test, which is a development build', () => {
    // The gate itself cannot be exercised both ways from here — it is folded at build time, which
    // is the whole point. What a release build drops is proved by grepping the built assets.
    expect(DEV_FIXTURES_AVAILABLE).toBe(true)
  })

  it('brings the pull requests, the issues and a year of contributions', async () => {
    const fixtures = await loadDevFixtures()
    expect(fixtures?.prs.length).toBeGreaterThan(0)
    expect(fixtures?.issues.length).toBeGreaterThan(0)
    expect(fixtures?.contributions).toHaveLength(365)
  })

  it('keeps the dates as Date objects', async () => {
    // The documented crash: a JSON round-trip turns these into strings, and every consumer that
    // sorts on `pr.updatedAt.getTime()` (WaitingForReviewTab, IssuesTab, ListHelpers) dies the
    // moment the Launchpad renders.
    const fixtures = await loadDevFixtures()
    expect(fixtures?.prs[0]?.updatedAt).toBeInstanceOf(Date)
    expect(fixtures?.prs[0]?.createdAt).toBeInstanceOf(Date)
  })

  it('hands out copies, so one session’s simulated changes cannot leak into the next', async () => {
    const first = await loadDevFixtures()
    first!.prs[0]!.status = 'merged'

    const second = await loadDevFixtures()
    expect(second!.prs[0]!.status).not.toBe('merged')
  })

  it('copies the issues too, not just the pull requests', async () => {
    const first = await loadDevFixtures()
    const second = await loadDevFixtures()
    expect(first!.issues[0]).not.toBe(second!.issues[0])
  })
})
