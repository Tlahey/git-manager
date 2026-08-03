/**
 * Renders a parsed `.feature` into the Markdown page VitePress builds.
 *
 * Everything here is a pure string transform over `DocFeature` — no filesystem,
 * no network — so the whole rendering contract is unit-testable and one input
 * always produces byte-identical output.
 */
import type { DocFeature, DocScenario, DocStep } from './parseDocFeatures.ts'

const REPO_BLOB_URL = 'https://github.com/Tlahey/git-manager/blob/main'

/** Where the generator copies the exported PNGs, relative to a feature page. */
export const SCREENSHOT_DIR = 'screenshots'

/** Longest `description:` front-matter value before it gets cut at a word boundary. */
const META_DESCRIPTION_MAX = 160

function escapeFrontMatter(value: string): string {
  return value.replace(/"/g, '\\"')
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`
}

/**
 * Makes a Gherkin step read as an instruction: quoted arguments become code
 * spans (they are filenames, branch names and other literals), and the sentence
 * gets a capital letter it does not carry in the `.feature` file.
 */
export function formatStepText(text: string): string {
  const withCode = text.replace(/"([^"]*)"/g, '`$1`')
  return withCode.charAt(0).toUpperCase() + withCode.slice(1)
}

/**
 * Same, for a step the reader is meant to perform. Gherkin writes those in the
 * first person present ("I stage the file …"), which reads as a narration
 * rather than an instruction — dropping the pronoun leaves the imperative.
 */
export function formatActionText(text: string): string {
  return formatStepText(text.replace(/^I /, ''))
}

function renderSteps(heading: string, steps: DocStep[], ordered: boolean): string[] {
  if (steps.length === 0) return []
  const format = ordered ? formatActionText : formatStepText
  const lines = steps.map(
    (step, index) => `${ordered ? `${index + 1}.` : '-'} ${format(step.text)}`
  )
  return [`**${heading}**`, '', ...lines]
}

function renderScenario(scenario: DocScenario): string[] {
  const blocks: string[] = [`## ${scenario.name}`, '', ...interleave(scenario.paragraphs)]

  if (scenario.screenshot) {
    blocks.push(
      `![${scenario.name}](./${SCREENSHOT_DIR}/${scenario.screenshot}.png)`,
      '',
      // Nothing hand-draws these: they are exported from the real app by the
      // very scenario documented above, so they cannot describe a UI that no
      // longer exists.
      `<p class="doc-shot-note">Captured from the running app by this scenario.</p>`,
      ''
    )
  }

  const actions = renderSteps('Do this', scenario.actions, true)
  if (actions.length > 0) blocks.push(...actions, '')

  const outcomes = renderSteps('You should see', scenario.outcomes, false)
  if (outcomes.length > 0) blocks.push(...outcomes, '')

  return blocks
}

/** Emits each paragraph followed by the blank line Markdown needs between them. */
function interleave(paragraphs: string[]): string[] {
  return paragraphs.flatMap((paragraph) => [paragraph, ''])
}

export function renderDocPage(feature: DocFeature): string {
  const summary = feature.paragraphs[0] ?? feature.scenarios[0]?.paragraphs[0] ?? feature.name

  const lines: string[] = [
    '---',
    `title: ${JSON.stringify(feature.name)}`,
    `description: "${escapeFrontMatter(truncate(summary, META_DESCRIPTION_MAX))}"`,
    '---',
    '',
    '<!--',
    '  GENERATED FILE — do not edit.',
    `  Source: ${feature.sourcePath}`,
    '  Rewrite the prose in that .feature file and re-run `pnpm --filter @git-manager/docs generate`.',
    '-->',
    '',
    `# ${feature.name}`,
    '',
    ...interleave(feature.paragraphs),
  ]

  for (const scenario of feature.scenarios) {
    lines.push(...renderScenario(scenario))
  }

  lines.push(
    '---',
    '',
    `<p class="doc-source">This page is generated from ` +
      `<a href="${REPO_BLOB_URL}/${feature.sourcePath}">${feature.sourcePath}</a>, ` +
      `the end-to-end test that drives the feature it describes.</p>`,
    ''
  )

  // Collapse the runs of blank lines the block assembly can leave behind, so
  // the output is stable whatever combination of sections a scenario has.
  return `${lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()}\n`
}
