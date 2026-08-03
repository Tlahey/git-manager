/**
 * Turns a `.feature` file into the doc-shaped data the Markdown renderer needs.
 *
 * The pipeline is deliberately deterministic: it only reads what a human wrote
 * and committed into the Gherkin file. No LLM runs at build time, so a doc page
 * can only change when the scenario it comes from changes.
 *
 * The conventions it relies on — all of them visible in the `.feature` files
 * themselves, see `apps/e2e/features/merge-editor.feature`:
 *
 *  - a scenario is doc-worthy when it carries the `@doc` tag (regression edge
 *    cases stay out of the docs);
 *  - its prose lives in the scenario's own free-text description block, which
 *    Gherkin parses natively — unlike `#` comments, which the AST only exposes
 *    as document-level lines you have to re-associate by line number;
 *  - the screenshot is joined by name through the existing
 *    `a full-window screenshot is saved as "<name>"` step, so one step both
 *    exports the PNG and tells the generator which PNG belongs to the page.
 */
import { AstBuilder, GherkinClassicTokenMatcher, Parser } from '@cucumber/gherkin'
import { IdGenerator } from '@cucumber/messages'
import type { Feature, Scenario, Step } from '@cucumber/messages'

/** The tag that opts a scenario into the documentation. */
export const DOC_TAG = '@doc'

/** Matches the step that exports the PNG, capturing the name it is saved under. */
const SCREENSHOT_STEP = /^a full-window screenshot is saved as "([^"]+)"$/

/** The zone variant — same contract, but the PNG is cropped to one element (its testid is the
 * first capture, irrelevant here; the saved name is the second). Used by pages documenting a
 * single piece of the chrome, where a full window would bury the subject. */
const AREA_SCREENSHOT_STEP = /^a screenshot of the "[^"]+" area is saved as "([^"]+)"$/

/**
 * The Connextra user-story lines conventionally opening a `Feature:` description.
 * They describe the *test's* actor, not the reader of the docs, so they are
 * dropped from the page intro — the prose paragraph below them is what ships.
 */
const USER_STORY_LINE = /^(As an?|I want|So that)\b/i

export interface DocStep {
  /** `Given` / `When` / `Then`, already resolved through any `And` / `But` continuation. */
  keyword: string
  text: string
}

export interface DocScenario {
  name: string
  /** Prose paragraphs from the scenario's description block. */
  paragraphs: string[]
  /** Steps the reader performs, i.e. the ones phrased as "I …". */
  actions: DocStep[]
  /** Steps asserting what the reader should then see. */
  outcomes: DocStep[]
  /** Name of the exported PNG, without extension — `null` when the scenario exports none. */
  screenshot: string | null
  /** 1-based line of the `Scenario:` keyword, for traceability links. */
  line: number
}

export interface DocFeature {
  /** Repo-relative path of the source `.feature` file. */
  sourcePath: string
  /** File basename without extension — the page's URL slug. */
  slug: string
  name: string
  paragraphs: string[]
  scenarios: DocScenario[]
}

/**
 * Removes the common indentation of a Gherkin free-text block, then folds it
 * into paragraphs: consecutive lines become one paragraph (Gherkin descriptions
 * are hard-wrapped in the source), blank lines separate paragraphs.
 */
export function toParagraphs(description: string | undefined, dropUserStory = false): string[] {
  if (!description) return []

  const lines = description.replace(/\r\n/g, '\n').split('\n')
  const indents = lines.filter((l) => l.trim() !== '').map((l) => l.match(/^ */)![0].length)
  const common = indents.length > 0 ? Math.min(...indents) : 0

  const paragraphs: string[] = []
  let current: string[] = []
  const flush = () => {
    if (current.length > 0) paragraphs.push(current.join(' '))
    current = []
  }

  for (const raw of lines) {
    const line = raw.slice(common).trimEnd()
    if (line.trim() === '') {
      flush()
      continue
    }
    if (dropUserStory && USER_STORY_LINE.test(line.trim())) continue
    current.push(line.trim())
  }
  flush()

  return paragraphs
}

/**
 * Resolves `And` / `But` to the keyword of the step they continue, so a step's
 * role no longer depends on where it sits in the list.
 */
function resolveKeywords(steps: readonly Step[]): DocStep[] {
  let primary = 'Given'
  return steps.map((step) => {
    const keyword = step.keyword.trim()
    if (keyword === 'Given' || keyword === 'When' || keyword === 'Then') primary = keyword
    return { keyword: primary, text: step.text.trim() }
  })
}

function toDocScenario(scenario: Scenario): DocScenario {
  const steps = resolveKeywords(scenario.steps)

  let screenshot: string | null = null
  const actions: DocStep[] = []
  const outcomes: DocStep[] = []

  for (const step of steps) {
    const shot = SCREENSHOT_STEP.exec(step.text) ?? AREA_SCREENSHOT_STEP.exec(step.text)
    if (shot) {
      screenshot = shot[1]
      continue
    }
    // `Given` steps build the fixture repository the test needs; they say nothing
    // to a reader who already has their own repository open.
    if (step.keyword === 'Given') continue
    // "I …" is the reader doing something; anything else is a state the test
    // waits on ("the interface has settled") or asserts ("the graph is shown").
    if (step.text.startsWith('I ')) actions.push(step)
    else if (step.keyword === 'Then') outcomes.push(step)
  }

  return {
    name: scenario.name.trim(),
    paragraphs: toParagraphs(scenario.description),
    actions,
    outcomes,
    screenshot,
    line: scenario.location.line,
  }
}

function isDocScenario(scenario: Scenario): boolean {
  return scenario.tags.some((tag) => tag.name === DOC_TAG)
}

/**
 * Parses one `.feature` source. Returns `null` when the file holds no `@doc`
 * scenario, so a caller can simply skip it.
 *
 * @param source    raw `.feature` contents
 * @param sourcePath repo-relative path, embedded in the page for traceability
 */
export function parseDocFeature(source: string, sourcePath: string): DocFeature | null {
  const parser = new Parser(new AstBuilder(IdGenerator.uuid()), new GherkinClassicTokenMatcher())
  const feature: Feature | undefined = parser.parse(source).feature
  if (!feature) return null

  const scenarios = feature.children
    .map((child) => child.scenario)
    .filter((scenario): scenario is Scenario => scenario !== undefined)
    .filter(isDocScenario)
    .map(toDocScenario)

  if (scenarios.length === 0) return null

  const undocumented = scenarios.filter((s) => s.paragraphs.length === 0)
  if (undocumented.length > 0) {
    throw new Error(
      `${sourcePath}: ${DOC_TAG} scenario(s) without a description block: ` +
        `${undocumented.map((s) => `"${s.name}"`).join(', ')}. ` +
        `Write the prose under the "Scenario:" line — it is what the doc page renders.`
    )
  }

  return {
    sourcePath,
    slug: sourcePath.replace(/^.*\//, '').replace(/\.feature$/, ''),
    name: feature.name.trim(),
    paragraphs: toParagraphs(feature.description, true),
    scenarios,
  }
}
