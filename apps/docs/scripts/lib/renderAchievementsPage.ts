/**
 * Renders the "All achievements" reference page from the app's achievement
 * catalog (`apps/desktop/src/stores/achievements.json`) and the English copy in
 * `packages/i18n/locales/en/launchpad.json`.
 *
 * Same contract as `renderDocPage.ts`: a pure string transform — no filesystem,
 * no network — so one input always produces byte-identical output. The page is
 * written into `docs/features/` by the generator and shares the other generated
 * pages' wipe-and-rewrite lifecycle; it just isn't backed by a `.feature` file,
 * because what it documents is data, not a UI flow.
 */

const REPO_BLOB_URL = 'https://github.com/Tlahey/git-manager/blob/main'

/** Where the achievement catalog lives, for the page's source footnote. */
export const ACHIEVEMENTS_SOURCE_PATH = 'apps/desktop/src/stores/achievements.json'

/** The subset of `AchievementDefinition` (apps/desktop, `lib/rewards/types.ts`) the page reads.
 *  Redeclared rather than imported: the docs generator must not reach into the app's source
 *  tree, and extra fields (rule kind, events, thresholds) are deliberately not documented —
 *  the reader-facing "how to unlock" is the translated description, not the rule internals. */
export interface AchievementEntry {
  id: string
  points: number
  type: 'bronze' | 'silver' | 'gold' | 'platinum'
}

const TIER_ORDER: AchievementEntry['type'][] = ['bronze', 'silver', 'gold', 'platinum']

const TIER_TITLES: Record<AchievementEntry['type'], string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
}

/** Resolves one achievement's copy from the flat-keyed English locale, loudly: an achievement
 *  shipping without its text is a bug the docs build should surface, not paper over. */
function copyFor(locale: Record<string, string>, id: string, field: string): string {
  const value = locale[`rewards.achievements.${id}.${field}`]
  if (!value) {
    throw new Error(
      `Missing English copy for achievement "${id}" (rewards.achievements.${id}.${field}) — ` +
        `add it to packages/i18n/locales/en/launchpad.json.`
    )
  }
  return value
}

/** Markdown tables split cells on `|`; achievement copy is free text. */
function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|')
}

export function renderAchievementsPage(
  achievements: AchievementEntry[],
  enLocale: Record<string, string>
): string {
  const lines: string[] = [
    '---',
    'title: "All achievements"',
    'description: "Every achievement in Git Manager — how to unlock each one, and the theme or cosmetic reward it grants."',
    '---',
    '',
    '<!--',
    '  GENERATED FILE — do not edit.',
    `  Source: ${ACHIEVEMENTS_SOURCE_PATH} (+ the English copy in packages/i18n/locales/en/launchpad.json).`,
    '  Edit those and re-run `pnpm --filter @git-manager/docs generate`.',
    '-->',
    '',
    '# All achievements',
    '',
    'Git Manager rewards everyday Git work — committing, merging pull requests, or running the',
    'right command in the built-in terminal — with achievements. Many of them unlock something',
    'concrete: most of the color themes in Settings → Appearance start locked, and an achievement',
    'is how you earn each one.',
    '',
    '::: warning Spoilers ahead',
    'In the app, a cosmetic reward stays hidden behind “???” until you unlock its achievement.',
    'This page reveals every reward — read on only if you want the full map.',
    ':::',
    '',
  ]

  for (const tier of TIER_ORDER) {
    const entries = achievements.filter((achievement) => achievement.type === tier)
    if (entries.length === 0) continue

    lines.push(`## ${TIER_TITLES[tier]}`, '', '| Achievement | How to unlock | Reward | Points |', '| --- | --- | --- | --- |')
    for (const entry of entries) {
      const title = copyFor(enLocale, entry.id, 'title')
      const description = copyFor(enLocale, entry.id, 'description')
      const reward = copyFor(enLocale, entry.id, 'reward')
      lines.push(
        `| **${escapeCell(title)}** | ${escapeCell(description)} | ${escapeCell(reward)} | ${entry.points} |`
      )
    }
    lines.push('')
  }

  lines.push(
    '---',
    '',
    `<p class="doc-source">This page is generated from ` +
      `<a href="${REPO_BLOB_URL}/${ACHIEVEMENTS_SOURCE_PATH}">${ACHIEVEMENTS_SOURCE_PATH}</a>, ` +
      `the catalog the app itself unlocks achievements from.</p>`,
    ''
  )

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`
}
