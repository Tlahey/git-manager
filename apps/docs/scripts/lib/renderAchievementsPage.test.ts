import { describe, expect, it } from 'vitest'
import { renderAchievementsPage, type AchievementEntry } from './renderAchievementsPage.ts'

const ACHIEVEMENTS: AchievementEntry[] = [
  { id: 'commit_1', points: 10, type: 'bronze' },
  { id: 'commit_10', points: 20, type: 'bronze', prerequisiteId: 'commit_1' },
  { id: 'pr_50', points: 80, type: 'gold', rewardIsCosmetic: true },
  { id: 'platinum', points: 200, type: 'platinum' },
]

const LOCALE: Record<string, string> = {
  'rewards.achievements.commit_1.title': 'First Steps',
  'rewards.achievements.commit_1.description': 'Make your first commit from the app.',
  'rewards.achievements.commit_1.reward': 'Bronze avatar frame',
  'rewards.achievements.commit_10.title': 'Getting Into It',
  'rewards.achievements.commit_10.description': 'Make 10 commits from the app.',
  'rewards.achievements.commit_10.reward': '20 XP',
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

  it('hides a cosmetic reward behind a spoiler, exactly as the app hides it behind "???"', () => {
    const page = renderAchievementsPage(ACHIEVEMENTS, LOCALE)
    expect(page).toContain(
      '<label class="doc-spoiler"><input type="checkbox" aria-label="Reveal spoiler" />' +
        '<span>Gold \\| avatar frame</span></label>'
    )
    // …and leaves a plain, non-cosmetic reward readable.
    expect(page).toContain('| Bronze avatar frame | 10 |')
  })

  it('hides a prerequisite-gated achievement, but names the one that opens it', () => {
    const page = renderAchievementsPage(ACHIEVEMENTS, LOCALE)
    // Both the title and the "how to unlock" copy are concealed — the app shows neither until the
    // prerequisite is done.
    expect(page).toContain('<span>**Getting Into It**</span>')
    expect(page).toContain('<span>Make 10 commits from the app.</span>')
    // The pointer out of the mystery stays in plain sight; it is what explains the blur.
    expect(page).toContain('_Unlock **First Steps** first._')
    // Its reward is not cosmetic, so it is not concealed a second time.
    expect(page).toContain('| 20 XP | 20 |')
  })

  it('leaves an ungated achievement with a plain reward entirely readable', () => {
    const page = renderAchievementsPage(ACHIEVEMENTS, LOCALE)
    expect(page).toContain(
      '| **Completionist** | Unlock every other achievement. | Platinum trophy | 200 |'
    )
  })

  it('marks the page as generated and points the footnote at the catalog', () => {
    const page = renderAchievementsPage(ACHIEVEMENTS, LOCALE)
    expect(page).toContain('GENERATED FILE — do not edit.')
    expect(page).toContain('apps/desktop/src/stores/achievements.json')
  })

  it('explains the spoiler blur rather than warning that everything is already revealed', () => {
    const page = renderAchievementsPage(ACHIEVEMENTS, LOCALE)
    expect(page).toContain('::: tip Spoilers stay hidden until you click one')
  })

  it('throws when an achievement has no English copy, so a gap fails the docs build', () => {
    const missing: AchievementEntry[] = [{ id: 'ghost', points: 5, type: 'bronze' }]
    expect(() => renderAchievementsPage(missing, LOCALE)).toThrow(
      /Missing English copy for achievement "ghost"/
    )
  })
})
