import { describe, expect, it } from 'vitest'
import { renderAchievementsPage, type AchievementEntry } from './renderAchievementsPage.ts'

const ACHIEVEMENTS: AchievementEntry[] = [
  { id: 'commit_1', points: 10, type: 'bronze' },
  { id: 'pr_50', points: 80, type: 'gold' },
  { id: 'platinum', points: 200, type: 'platinum' },
]

const LOCALE: Record<string, string> = {
  'rewards.achievements.commit_1.title': 'First Steps',
  'rewards.achievements.commit_1.description': 'Make your first commit from the app.',
  'rewards.achievements.commit_1.reward': 'Bronze avatar frame',
  'rewards.achievements.pr_50.title': 'Merge Machine',
  'rewards.achievements.pr_50.description': 'Merge 50 pull requests.',
  'rewards.achievements.pr_50.reward': 'Gold | avatar frame',
  'rewards.achievements.platinum.title': 'Completionist',
  'rewards.achievements.platinum.description': 'Unlock every other achievement.',
  'rewards.achievements.platinum.reward': 'Platinum trophy',
}

describe('renderAchievementsPage', () => {
  it('groups achievements under their tier heading with the translated copy', () => {
    const page = renderAchievementsPage(ACHIEVEMENTS, LOCALE)

    expect(page).toContain('## Bronze')
    expect(page).toContain('## Gold')
    expect(page).toContain('## Platinum')
    // Silver has no entry and must not render an empty section.
    expect(page).not.toContain('## Silver')

    expect(page).toContain(
      '| **First Steps** | Make your first commit from the app. | Bronze avatar frame | 10 |'
    )
    expect(page).toContain('| **Completionist** | Unlock every other achievement. | Platinum trophy | 200 |')
  })

  it('escapes pipe characters so free-text copy cannot break the table', () => {
    const page = renderAchievementsPage(ACHIEVEMENTS, LOCALE)
    expect(page).toContain('Gold \\| avatar frame')
  })

  it('marks the page as generated and points the footnote at the catalog', () => {
    const page = renderAchievementsPage(ACHIEVEMENTS, LOCALE)
    expect(page).toContain('GENERATED FILE — do not edit.')
    expect(page).toContain('apps/desktop/src/stores/achievements.json')
  })

  it('warns about spoilers, since the app itself hides cosmetic rewards until unlocked', () => {
    const page = renderAchievementsPage(ACHIEVEMENTS, LOCALE)
    expect(page).toContain('::: warning Spoilers ahead')
  })

  it('throws when an achievement has no English copy, so a gap fails the docs build', () => {
    const missing: AchievementEntry[] = [{ id: 'ghost', points: 5, type: 'bronze' }]
    expect(() => renderAchievementsPage(missing, LOCALE)).toThrow(
      /Missing English copy for achievement "ghost"/
    )
  })
})
