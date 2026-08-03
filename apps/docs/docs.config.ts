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
 * open something, learn the window, read history, change it, survive the hard parts, then the
 * layers around the core (remotes, everyday tools, AI, GitHub, settings). Within a section the
 * first page is the one a newcomer needs first.
 */
export const DOC_SECTIONS: DocSection[] = [
  {
    // The first session: get a repository open, meet the home screen, learn the window's fixed
    // landmarks before any single feature.
    title: 'Getting started',
    features: ['open-repo', 'dashboard', 'interface-overview'],
  },
  {
    title: 'Reading your repository',
    features: ['commit-graph', 'sidebar-navigation', 'blame-history', 'bisect'],
  },
  {
    // undo-redo lives here rather than with branches: it is the safety net over the actions this
    // section teaches, not a branch concept.
    title: 'Making changes',
    features: ['working-tree', 'commit', 'git-hooks', 'undo-redo'],
  },
  {
    title: 'When Git gets in the way',
    features: ['merge-editor', 'rebase-conflict', 'rebase-progress', 'fixup-autosquash'],
  },
  {
    title: 'Branches, stashes & worktrees',
    features: ['branch-create', 'stash-stack', 'worktree', 'submodule', 'detached-head'],
  },
  {
    title: 'Syncing with remotes',
    features: ['remote-fetch-pull', 'remote-push'],
  },
  {
    // Cross-cutting helpers used all day, whatever you are doing — distinct from the
    // repository-scoped tools below.
    title: 'Everyday workflow',
    features: ['command-palette', 'notifications', 'activity-log', 'rewards'],
  },
  {
    title: 'Repository tools',
    features: ['patch-workspace', 'package-health'],
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
    title: 'Launchpad',
    features: [
      'launchpad-prs',
      'launchpad-organize',
      'launchpad-issues',
      'launchpad-commit-stats',
    ],
  },
  {
    title: 'Settings',
    features: ['settings', 'settings-repository'],
  },
]

/** Where a `@doc` feature that no section claims ends up. */
export const FALLBACK_SECTION = 'More features'
