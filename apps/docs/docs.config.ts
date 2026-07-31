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

/** Feature pages grouped into sidebar sections, top to bottom. */
export const DOC_SECTIONS: DocSection[] = [
  {
    title: 'Getting started',
    features: ['open-repo'],
  },
  {
    title: 'Reading your repository',
    features: ['commit-graph', 'blame-history', 'bisect', 'sidebar-navigation'],
  },
  {
    title: 'Making changes',
    features: ['working-tree', 'commit'],
  },
  {
    title: 'When Git gets in the way',
    features: ['merge-editor', 'rebase-conflict', 'rebase-progress', 'fixup-autosquash'],
  },
  {
    title: 'Branches, stashes & worktrees',
    features: ['stash-stack', 'worktree', 'submodule', 'detached-head', 'undo-redo'],
  },
  {
    title: 'Syncing with remotes',
    features: ['remote-fetch-pull', 'remote-push', 'branch-create'],
  },
  {
    title: 'Tools',
    features: ['patch-workspace', 'package-health'],
  },
  {
    title: 'AI features',
    features: [
      'ai-generation',
      'daily-summary',
      'ai-commit-recompose',
      'ai-explanation',
      'ai-code-review',
      'ai-pr-description',
      'ai-commit-search',
      'action-journal',
      'ai-summary-search',
    ],
  },
  {
    title: 'Dashboard',
    features: ['dashboard'],
  },
  {
    title: 'Rewards',
    features: ['rewards'],
  },
  {
    title: 'Launchpad',
    features: ['launchpad-prs', 'launchpad-organize'],
  },
  {
    title: 'Workflow tools',
    features: ['command-palette', 'settings', 'notifications'],
  },
]

/** Where a `@doc` feature that no section claims ends up. */
export const FALLBACK_SECTION = 'More features'
