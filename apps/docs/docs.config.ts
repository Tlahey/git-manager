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
    features: ['commit-graph', 'file-explorer', 'blame-history', 'compare-branches'],
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
      'tags',
      'stash-stack',
      'worktree',
      'submodule',
      'detached-head',
    ],
  },
  {
    title: 'When Git gets in the way',
    features: [
      'merge-branches',
      'merge-editor',
      'rebase-conflict',
      'rebase-progress',
      'interactive-rebase',
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
    // terminal and package overview.
    title: 'Toolbox',
    features: ['bisect', 'patch-workspace', 'terminal', 'package-health'],
  },
  {
    // Ordered by how the features feed each other: composing commits, then the briefings pair
    // (summary search reads what the daily summary writes), then the explainers, then the one
    // feature about the app's own actions rather than the repository.
    title: 'AI features',
    features: [
      'ai-generation',
      'ai-commit-recompose',
      'daily-summary',
      'ai-summary-search',
      'ai-explanation',
      'ai-code-review',
      'ai-pr-description',
      'ai-commit-search',
      'action-journal',
    ],
  },
  {
    // Tracking the work rather than the code — one repository's own board, whose cards live in its
    // `.git`. Sits just above Launchpad, which is the same concern read across every repository.
    title: 'Planning',
    features: ['board'],
  },
  {
    title: 'Launchpad',
    features: ['launchpad-prs', 'launchpad-organize', 'launchpad-issues', 'launchpad-commit-stats'],
  },
  {
    // The generator appends the "All achievements" reference page (rendered from
    // stores/achievements.json, not from a .feature file) to this section — see
    // ACHIEVEMENTS_SECTION below and renderAchievementsPage.ts.
    title: 'Rewards',
    features: ['rewards'],
  },
  {
    title: 'Settings',
    features: ['settings', 'settings-repository'],
  },
  {
    // Kept last so it sits right above the hand-curated "Help" section (the troubleshooting
    // page) in the rendered sidebar — together they form the debugging corner of the docs.
    title: 'Debugging',
    features: ['activity-log'],
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
