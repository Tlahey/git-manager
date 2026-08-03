import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitepress'
import type { DefaultTheme } from 'vitepress'
import { DOCS_ROUTE, LANDING_PAGE_ROUTE, SITE_BASE } from '../docs.config.ts'

// Read rather than `import`: the file is written by `scripts/generate.ts` on
// every run, and a bundled JSON import would be inlined into the config's build
// cache — the sidebar would then lag a generation behind.
const featureSidebar: DefaultTheme.SidebarItem[] = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'sidebar.json'), 'utf8')
)

/** The hand-written introduction (docs/index.md) — where the documentation opens. */
const DOCS_ENTRY = `${DOCS_ROUTE}/`
/** The hand-written install guide (docs/download.md) — the other page not generated. */
const DOCS_DOWNLOAD = `${DOCS_ROUTE}/download`

/**
 * The landing page's stylesheet, published as a standalone hashed file by the
 * generator rather than bundled — see `copyLandingCss()` for why that isolation
 * matters. Only the home page links it.
 */
const LANDING_CSS: { file: string } = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'landing-css.json'), 'utf8')
)

/**
 * One VitePress app serves the whole GitHub Pages site: the landing page at `/`
 * (index.md → <LandingPage />) and the generated documentation under `/docs/`.
 */
export default defineConfig({
  title: 'Git Manager',
  description: 'How every Git Manager feature works — documented from the app itself.',
  lang: 'en-US',
  base: SITE_BASE,
  cleanUrls: true,
  // Dark on a first visit whatever the OS prefers, but the reader keeps the
  // switch (and their choice, in localStorage). Note the home page stays dark
  // either way: it is the marketing landing page, which has no light design —
  // see the `html.landing` gate in apps/landing-page/style.css.
  appearance: 'dark',
  // The package README documents the pipeline for contributors; it is not a page
  // of the site VitePress would otherwise publish it as.
  srcExclude: ['README.md'],
  // `head` entries are emitted verbatim, so they carry the base themselves.
  head: [
    // The bare mascot, not the badged app icon: at 32px the badge's rounded
    // square eats most of the space and the octopus inside it turns to mush.
    [
      'link',
      { rel: 'icon', type: 'image/png', sizes: '32x32', href: `${SITE_BASE}mascot-icon-32.png` },
    ],
    [
      'link',
      { rel: 'icon', type: 'image/png', sizes: '128x128', href: `${SITE_BASE}mascot-icon-128.png` },
    ],
    // Apple touch icons are composited onto an opaque tile, which a transparent
    // PNG makes a mess of — the badged app icon is the right artwork here.
    ['link', { rel: 'apple-touch-icon', href: `${SITE_BASE}app-icon-256.png` }],
    // No Google Fonts link, unlike the standalone landing page: VitePress ships
    // a self-hosted Inter, so requesting a second copy from fonts.googleapis.com
    // would only add a third-party round trip — on a site whose pitch is that
    // nothing leaves your machine.
  ],
  /**
   * Gives the home page — and only the home page — the two things that make it
   * the landing page: its stylesheet, and the `html.landing` class that
   * stylesheet's few global rules are gated on.
   *
   * Both are done here rather than at runtime because both must be in place on
   * the first paint. `LandingPage.vue` adds and removes them as well, for
   * client-side navigation between the docs and the home page; doing it only
   * there would leave a first visit flashing an unstyled page.
   */
  transformHtml(code, _id, { page }) {
    if (page !== 'index.md') return code
    return code.replace('<html ', '<html class="landing" ').replace(
      '</head>',
      // Same id LandingPage.vue looks for, so it adopts this link instead of
      // appending a second one after hydration.
      `<link id="landing-stylesheet" rel="stylesheet" href="${SITE_BASE}${LANDING_CSS.file}"></head>`
    )
  },
  themeConfig: {
    logo: '/mascot-icon-128.png',
    siteTitle: 'Git Manager Docs',
    // The site's home is the landing page, an ordinary route of this same app.
    logoLink: LANDING_PAGE_ROUTE,
    nav: [
      { text: 'Documentation', link: DOCS_ENTRY, activeMatch: DOCS_ROUTE },
      { text: 'Home', link: LANDING_PAGE_ROUTE },
    ],
    // The introduction and the install guide are both hand-written and sit above
    // the generated feature groups, so readers land on an explanation of what the
    // documentation covers (and how to get the app) rather than in the middle of
    // one feature.
    sidebar: [
      {
        text: 'Start here',
        items: [
          { text: 'Introduction', link: DOCS_ENTRY },
          { text: 'Download & Install', link: DOCS_DOWNLOAD },
          { text: 'Your first repository', link: `${DOCS_ROUTE}/first-launch` },
          { text: 'Private by design', link: `${DOCS_ROUTE}/privacy` },
          { text: 'Set up your AI provider', link: `${DOCS_ROUTE}/ai-setup` },
          { text: 'Keyboard shortcuts', link: `${DOCS_ROUTE}/shortcuts` },
        ],
      },
      ...featureSidebar,
      {
        text: 'Help',
        items: [{ text: 'Troubleshooting', link: `${DOCS_ROUTE}/troubleshooting` }],
      },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/Tlahey/git-manager' }],
    search: { provider: 'local' },
    editLink: {
      // Feature pages are generated, so "edit" points at the .feature file the
      // prose actually lives in rather than at the throwaway Markdown.
      pattern: 'https://github.com/Tlahey/git-manager/tree/main/apps/e2e/features',
      text: 'Edit the scenario behind this page',
    },
    outline: [2, 3],
    footer: {
      message: 'MIT licensed · Screenshots exported from the real app by the end-to-end suite.',
      copyright: 'Made by Tlahey',
    },
  },
})
