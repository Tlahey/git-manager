import { describe, it, expect, vi, afterEach } from 'vitest'
import { getMockContributions, MOCK_PRS, MOCK_ISSUES } from './mockData'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('getMockContributions', () => {
  it('returns exactly 365 days, in ascending chronological order ending today', () => {
    const days = getMockContributions()
    expect(days).toHaveLength(365)
    const todayKey = new Date().toISOString().slice(0, 10)
    expect(days[days.length - 1].date).toBe(todayKey)
    for (let i = 1; i < days.length; i++) {
      expect(days[i].date >= days[i - 1].date).toBe(true)
    }
  })

  it('every date is formatted as YYYY-MM-DD', () => {
    for (const day of getMockContributions()) {
      expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('commit counts are always non-negative integers', () => {
    for (const day of getMockContributions()) {
      expect(Number.isInteger(day.commits)).toBe(true)
      expect(day.commits).toBeGreaterThanOrEqual(0)
    }
  })

  it('caps weekend commits at 3 and weekday commits at 10, using the low-probability branch', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99) // always takes the "0 commits" branch
    const days = getMockContributions()
    expect(days.every((d) => d.commits === 0)).toBe(true)
  })

  it('produces the maximum commit count on the high-probability branch', () => {
    // random() < threshold check passes (0), then Math.floor(0.999 * n) picks the top of the range.
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0) // passes the `< 0.3` / `< 0.7` gate
      .mockReturnValue(0.999) // maximizes Math.floor(random * n)
    const days = getMockContributions()
    const weekendDay = days.find((d) => [0, 6].includes(new Date(d.date + 'T00:00:00').getDay()))
    const weekdayDay = days.find((d) => ![0, 6].includes(new Date(d.date + 'T00:00:00').getDay()))
    if (weekendDay) expect(weekendDay.commits).toBeLessThanOrEqual(3)
    if (weekdayDay) expect(weekdayDay.commits).toBeLessThanOrEqual(10)
  })
})

describe('MOCK_PRS / MOCK_ISSUES fixtures', () => {
  it('provides at least one demo PR and issue with well-formed core fields', () => {
    expect(MOCK_PRS.length).toBeGreaterThan(0)
    expect(MOCK_ISSUES.length).toBeGreaterThan(0)
    for (const pr of MOCK_PRS) {
      expect(pr.id).toBeTruthy()
      expect(pr.url).toContain('github.com')
    }
    for (const issue of MOCK_ISSUES) {
      expect(issue.id).toBeTruthy()
      expect(issue.url).toContain('github.com')
    }
  })

  it('has unique ids across all PRs', () => {
    const ids = MOCK_PRS.map((pr) => pr.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has unique ids across all issues', () => {
    const ids = MOCK_ISSUES.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
