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
 *  the reader-facing "how to unlock" is the translated description, not the rule internals.
 *
 *  The two spoiler flags are read for exactly one reason: they are what the app itself conceals
 *  (`RewardsTab.tsx` — a cosmetic reward stays "???" until its achievement unlocks, and a
 *  prerequisite-gated one shows as a mystery challenge with no title and no description until the
 *  achievement it depends on is done). A reference page that prints both in plain text takes that
 *  away from whoever opens it for one lookup, so it hides the same cells behind a click. */
export interface AchievementEntry {
  id: string
  points: number
  type: 'bronze' | 'silver' | 'gold' | 'platinum'
  /** The reward is a cosmetic (a theme, a frame) the app hides behind "???" until unlocked. */
  rewardIsCosmetic?: boolean
  /** Id of the achievement that has to be unlocked before this one is even shown in the app. */
  prerequisiteId?: string
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

/**
 * Wraps content the app would still be hiding in a click-to-reveal spoiler.
 *
 * A `<label>` around a visually-hidden checkbox rather than a script: this is generated Markdown
 * with no component behind it, and a checkbox is focusable and toggles on Space, so the keyboard
 * path comes for free and the page keeps working with JavaScript disabled. The styling lives in
 * `.vitepress/theme/custom.css` (`.doc-spoiler`) — blurred until checked.
 *
 * The text stays in the DOM on purpose: this is a courtesy against reading a reward by accident,
 * not a lock, and it is what keeps the page searchable and readable to a screen reader.
 */
function spoiler(content: string): string {
  return (
    `<label class="doc-spoiler"><input type="checkbox" aria-label="Reveal spoiler" />` +
    `<span>${content}</span></label>`
  )
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
    '::: tip Spoilers stay hidden until you click one',
    'The app conceals two things until you have earned them: a cosmetic reward stays behind “???”',
    'until its achievement unlocks, and a challenge that depends on another one is not shown at all',
    'until that one is done. The blurred cells below are exactly those — click one to reveal it.',
    'Nothing is revealed for you, so this page is safe to read for the ones you have already met.',
    ':::',
    '',
  ]

  for (const tier of TIER_ORDER) {
    const entries = achievements.filter((achievement) => achievement.type === tier)
    if (entries.length === 0) continue

    lines.push(`## ${TIER_TITLES[tier]}`, '', '| Achievement | How to unlock | Reward | Points |', '| --- | --- | --- | --- |')
    for (const entry of entries) {
      const title = `**${escapeCell(copyFor(enLocale, entry.id, 'title'))}**`
      const description = escapeCell(copyFor(enLocale, entry.id, 'description'))
      const reward = escapeCell(copyFor(enLocale, entry.id, 'reward'))

      // A gated achievement is a "mystery challenge" in the app: no title, no description, only
      // the name of the one to unlock first. That pointer is the part worth keeping visible —
      // it is what tells a reader why the row is blurred and how to open it in the app.
      const gate = entry.prerequisiteId
        ? `_Unlock **${escapeCell(copyFor(enLocale, entry.prerequisiteId, 'title'))}** first._ `
        : ''

      lines.push(
        `| ${entry.prerequisiteId ? spoiler(title) : title} ` +
          `| ${gate}${entry.prerequisiteId ? spoiler(description) : description} ` +
          `| ${entry.rewardIsCosmetic ? spoiler(reward) : reward} | ${entry.points} |`
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
