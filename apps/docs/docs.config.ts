/**
 * Curation layer over the generated pages.
 *
 * The `@doc` tag decides *whether* a scenario is documented; this file decides
 * *where it lands* in the sidebar and in which order. Keeping the two separate
 * means adding a scenario never silently reshuffles the navigation, and a
 * feature file nobody has placed yet still shows up (under `FALLBACK_SECTION`)
 * instead of disappearing.
 */

/**
 * Where the whole site is published — landing page *and* documentation, which
 * are one VitePress app. GitHub Pages serves a project site from a sub-path, and
 * VitePress needs the real value to build its router and asset URLs.
 */
export const SITE_BASE = '/git-manager/'

/**
 * Route prefix of the documentation, under the landing page at the root. Kept
 * at `/docs` so the URLs published before the two sites merged still resolve.
 * The generator writes its Markdown into the matching `docs/` directory.
 */
export const DOCS_ROUTE = '/docs'

/**
 * The landing page: the site's home, and now an ordinary internal route rather
 * than a separate deployment.
 */
export const LANDING_PAGE_ROUTE = '/'

export interface DocSection {
  title: string
  /** Feature slugs — the `.feature` basename — in the order they should appear. */
  features?: string[]
  /** Nested submenus, for a section broad enough that one flat list would bury its shape —
   * see the GitHub section below. Rendered after `features`, in the order listed. */
  subsections?: DocSubsection[]
}

export interface DocSubsection {
  title: string
  /** Feature slugs — the `.feature` basename — in the order they should appear. */
  features: string[]
}

/**
 * Feature pages grouped into sidebar sections, top to bottom — ordered as a reader's journey:
 * learn the window and its fixed landmarks, read history, change it, survive the hard parts,
 * then the layers around the core (remotes, tools, AI, GitHub, rewards, settings, debugging).
 * Within a section the first page is the one a newcomer needs first.
 *
 * The hand-written "Start here" pages (introduction, install, first launch, privacy, AI setup,
 * shortcuts) sit above these groups — they live in `.vitepress/config.ts`, not here.
 */
export const DOC_SECTIONS: DocSection[] = [
  {
    // The window itself: every fixed landmark (tabs, toolbar, footer, sidebar) plus the
    // cross-cutting helpers reachable from any of them (palette, notifications).
    title: 'The interface',
    features: [
      'open-repo',
      'dashboard',
      'interface-overview',
      'sidebar-navigation',
      'command-palette',
      'notifications',
    ],
  },
  {
    // Pure reading — nothing here changes the repository. compare-branches lives here rather
    // than with branches: comparing is how you read two of them, not an action on one.
    title: 'Reading your repository',
    features: [
      'commit-graph',
      'file-explorer',
      'blame-history',
      'compare-branches',
      'compare-to-workdir',
    ],
  },
  {
    // undo-redo lives here rather than with branches: it is the safety net over the actions this
    // section teaches, not a branch concept.
    title: 'Making changes',
    features: ['working-tree', 'commit', 'git-hooks', 'undo-redo'],
  },
  {
    title: 'Branches, stashes & worktrees',
    features: [
      'branch-create',
      'branch-rename',
      'branch-upstream',
      'branch-cleanup',
      'tags',
      'stash-stack',
      'worktree',
      'worktree-cleanup',
      'submodule',
      'detached-head',
    ],
  },
  {
    title: 'When Git gets in the way',
    features: [
      'ref-drop',
      'merge-branches',
      'merge-target',
      'merge-editor',
      'rebase-conflict',
      'rebase-progress',
      'interactive-rebase',
      'commit-reorder',
      'fixup-autosquash',
      'merge-commit-actions',
    ],
  },
  {
    title: 'Syncing with remotes',
    features: ['remote-fetch-pull', 'remote-push'],
  },
  {
    // The repository-scoped tools: diagnosis (bisect), portability (patches), and the built-in
    // terminal and package overview. `package-health-updates` follows `package-health` since it's
    // the one destination inside that same tool reaching the network.
    title: 'Toolbox',
    features: ['bisect', 'patch-workspace', 'terminal', 'package-health', 'package-health-updates'],
  },
  {
    // Ordered by how the features feed each other: composing commits, then the briefings pair
    // (summary search reads what the daily summary writes), then the explainers, then the one
    // feature about the app's own actions rather than the repository.
    title: 'AI features',
    features: [
      'ai-generation',
      'ai-commit-recompose',
      'wip-directory-batch',
      'daily-summary',
      'ai-summary-search',
      'ai-explanation',
      'ai-code-review',
      'ai-commit-search',
      'action-journal',
    ],
  },
  {
    // Tracking the work rather than the code — one repository's own board, whose cards live in its
    // `.git`. Sits just above GitHub's Launchpad submenu, which is the same concern read across
    // every repository.
    // `board-cards` is the card record's own page — assignee/priority/due date/tags, relations
    // between cards, deleting and moving one — split out because `board.feature` is already the
    // board-level tour and a single page holding both would bury one under the other.
    // `board-card-activity` follows it for the same reason: the record's third section (after
    // fields and checklist) gets its own page rather than growing board-cards further.
    // `board-card-branch` is the card's fourth section — the one no board hosted anywhere else can
    // offer, since it needs the same git the board itself is stored in.
    // `board-recovery` comes last: it is what you reach for after board.feature's own board is
    // already lost, not a step of building or filling in one.
    title: 'Planning',
    features: [
      'board',
      'board-cards',
      'board-card-activity',
      'board-card-branch',
      'board-recovery',
    ],
  },
  {
    // Everything a connected GitHub account unlocks, and nothing else does — Launchpad's four
    // tabs, drafting a PR description (the one AI feature whose output is meant to leave the app
    // onto GitHub itself — see ai-pr-description.feature), and the GitHub-Issues board. Split into
    // submenus rather than one flat list because these are different journeys that only share the
    // account behind them; a reader who wants one should not have to scan the others.
    title: 'GitHub',
    subsections: [
      {
        title: 'Launchpad',
        features: [
          'launchpad-prs',
          'launchpad-organize',
          'launchpad-issues',
          'issue-actions',
          // Not the Issues tab above — the commit graph's own sidebar section, listing this one
          // repository's issues. Placed here anyway: it is still a GitHub-issues journey, gated on
          // the same connected account, and a reader following this group to learn about issues
          // should find it rather than stumble onto it under "Reading your repository".
          'saved-filters-graph',
          'launchpad-commit-stats',
        ],
      },
      {
        title: 'Pull requests',
        features: [
          'pr-review-hover',
          'pr-detail-view',
          'pr-actions',
          'pr-creation',
          'ai-pr-description',
        ],
      },
      {
        title: 'Board',
        features: ['board-github'],
      },
    ],
  },
  {
    // The generator appends the "All achievements" reference page (rendered from
    // stores/achievements.json, not from a .feature file) to this section — see
    // ACHIEVEMENTS_SECTION below and renderAchievementsPage.ts.
    title: 'Rewards',
    features: ['rewards'],
  },
  {
    // One page per settings tab, the way the GitHub group is one page per journey — a single
    // "Settings" page holding all ten-plus scenarios stopped reading as a page and started
    // reading as a dump. Flat, unlike GitHub's `subsections`: every entry here is already one
    // page, so nesting each in its own one-item submenu would add a click to reach it for
    // nothing — `subsections` earns its keep only when a submenu actually holds more than one
    // page (Launchpad's four).
    title: 'Settings',
    features: [
      'settings',
      'settings-ai',
      'settings-appearance',
      'settings-integrations',
      'settings-tools',
      'settings-repository',
      'settings-board',
    ],
  },
  {
    // Kept last so it sits right above the hand-curated "Help" section (the troubleshooting
    // page) in the rendered sidebar — together they form the debugging corner of the docs.
    // error-report follows activity-log because it is what you do *after* reading one: the log
    // is where you find the failure, the report is how you send it.
    title: 'Debugging',
    features: ['activity-log', 'error-report'],
  },
]

/**
 * The section the generated achievements reference page is appended to, and the slug it is
 * published under (`docs/features/<slug>.md` — inside `features/` so it shares the
 * wipe-and-rewrite lifecycle of the other generated pages).
 */
export const ACHIEVEMENTS_SECTION = 'Rewards'
export const ACHIEVEMENTS_SLUG = 'achievements'

/** Where a `@doc` feature that no section claims ends up. */
export const FALLBACK_SECTION = 'More features'
