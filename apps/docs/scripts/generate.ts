/**
 * Regenerates the feature pages of the documentation site from the end-to-end
 * `.feature` files, and copies in the screenshots those same scenarios export.
 *
 * Run it with `pnpm --filter @git-manager/docs generate` (the `dev` and `build`
 * scripts already do). Pass `--strict` to fail instead of warn when a
 * documented scenario has no screenshot on disk yet — that is what the deploy
 * workflow uses, so a published page is never missing its picture.
 *
 * Output is written wholesale on every run and the target directories are
 * emptied first: deleting a `@doc` scenario removes its page rather than
 * leaving a stale one behind. Nothing it writes is committed.
 */
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseDocFeature } from './lib/parseDocFeatures.ts'
import { renderDocPage, SCREENSHOT_DIR } from './lib/renderDocPage.ts'
import { buildSidebar } from './lib/buildSidebar.ts'
import type { DocFeature } from './lib/parseDocFeatures.ts'
import { DOC_SECTIONS, DOCS_ROUTE, FALLBACK_SECTION } from '../docs.config.ts'

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const REPO_ROOT = join(APP_ROOT, '../..')

const FEATURES_SRC = join(REPO_ROOT, 'apps/e2e/features')
/** Where the e2e `screenshots` script exports its PNGs. */
const SHOTS_SRC = join(REPO_ROOT, 'docs/screenshots')

/**
 * The landing page's images (icons, the OG card, the app screenshot it embeds).
 * Mirrored rather than moved: the landing page's markup, styles and behaviour
 * are still owned by `apps/landing-page`, and this site renders them as its home.
 */
const LANDING_PUBLIC_SRC = join(REPO_ROOT, 'apps/landing-page/public')
const LANDING_CSS_SRC = join(REPO_ROOT, 'apps/landing-page/style.css')

/**
 * The generated pages live under `docs/features/`, beside — but never on top of
 * — `docs/index.md`, the hand-written introduction. Only `features/` is wiped
 * and rewritten on each run.
 */
const DOCS_OUT = join(APP_ROOT, DOCS_ROUTE.replace(/^\//, ''))
const PAGES_OUT = join(DOCS_OUT, 'features')
const SHOTS_OUT = join(PAGES_OUT, SCREENSHOT_DIR)
const PUBLIC_OUT = join(APP_ROOT, 'public')
const SIDEBAR_OUT = join(APP_ROOT, '.vitepress/sidebar.json')
const LANDING_CSS_MANIFEST = join(APP_ROOT, '.vitepress/landing-css.json')

const strict = process.argv.includes('--strict')

function readDocFeatures(): DocFeature[] {
  return readdirSync(FEATURES_SRC)
    .filter((name) => name.endsWith('.feature'))
    .sort()
    .map((name) =>
      parseDocFeature(readFileSync(join(FEATURES_SRC, name), 'utf8'), `apps/e2e/features/${name}`)
    )
    .filter((feature): feature is DocFeature => feature !== null)
}

/**
 * Drops the screenshot reference of any scenario whose PNG has not been
 * captured yet, so the site still builds on a checkout where nobody has run the
 * e2e suite. Returns the names that were missing.
 */
function copyScreenshots(features: DocFeature[]): string[] {
  const missing: string[] = []

  for (const feature of features) {
    for (const scenario of feature.scenarios) {
      if (!scenario.screenshot) continue
      const file = `${scenario.screenshot}.png`
      try {
        copyFileSync(join(SHOTS_SRC, file), join(SHOTS_OUT, file))
      } catch {
        missing.push(`${feature.slug} → ${file}`)
        scenario.screenshot = null
      }
    }
  }

  return missing
}

/**
 * Publishes the landing page's stylesheet as a standalone file the home page
 * links to, instead of letting it into the site-wide bundle.
 *
 * That isolation is load-bearing, not an optimisation. The stylesheet is written
 * against bare browser defaults and styles generic class names — `.nav`,
 * `.footer`, `.badge` — while VitePress scopes its own rules with `data-v-*` but
 * still puts `class="nav"` on the sidebar. Bundled globally, `.nav { position:
 * fixed }` tore the documentation sidebar out of the layout. Only the home page
 * loads it now, so the whole class of collisions cannot happen, and doc readers
 * stop paying ~19 kB for marketing CSS they never render.
 *
 * The name carries a content hash: `public/` is copied verbatim into the build,
 * so nothing else would bust a browser cache when the stylesheet changes.
 *
 * @returns the published filename, for the config to link to
 */
function copyLandingCss(): string {
  const css = readFileSync(LANDING_CSS_SRC)
  const hash = createHash('sha256').update(css).digest('hex').slice(0, 8)
  const file = `landing.${hash}.css`
  writeFileSync(join(PUBLIC_OUT, file), css)
  return file
}

function main(): void {
  const features = readDocFeatures()
  if (features.length === 0) {
    throw new Error(`No @doc scenario found under ${FEATURES_SRC} — nothing to document.`)
  }

  rmSync(PAGES_OUT, { recursive: true, force: true })
  mkdirSync(SHOTS_OUT, { recursive: true })
  rmSync(PUBLIC_OUT, { recursive: true, force: true })

  // The landing page's markup references these by bare filename, so they have to
  // sit at the site root — which `public/` is.
  cpSync(LANDING_PUBLIC_SRC, PUBLIC_OUT, { recursive: true })
  writeFileSync(LANDING_CSS_MANIFEST, `${JSON.stringify({ file: copyLandingCss() })}\n`, 'utf8')

  const missing = copyScreenshots(features)

  for (const feature of features) {
    writeFileSync(join(PAGES_OUT, `${feature.slug}.md`), renderDocPage(feature), 'utf8')
  }

  const sidebar = buildSidebar(features, DOC_SECTIONS, FALLBACK_SECTION)
  mkdirSync(dirname(SIDEBAR_OUT), { recursive: true })
  writeFileSync(SIDEBAR_OUT, `${JSON.stringify(sidebar, null, 2)}\n`, 'utf8')

  const scenarioCount = features.reduce((total, f) => total + f.scenarios.length, 0)
  console.log(`Generated ${features.length} page(s) from ${scenarioCount} @doc scenario(s).`)

  if (missing.length > 0) {
    const detail = missing.map((entry) => `  - ${entry}`).join('\n')
    const hint =
      'Capture them with `pnpm build:e2e && pnpm --filter @git-manager/e2e docs:screenshots`.'
    if (strict) throw new Error(`Missing screenshots:\n${detail}\n${hint}`)
    console.warn(`Warning — missing screenshots (pages rendered without them):\n${detail}\n${hint}`)
  }
}

main()
