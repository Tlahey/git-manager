import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { composeStory } from '@storybook/react-vite'
import { DEFAULT_SURFACES, DEFAULT_THEMES, type SurfaceId } from './constants'
import { runAxe } from './axe'
import { collectViolationRecords, summarizeRecords } from './reporter'
import type { ApcaTaskMeta } from './apca-report-types'

type ComposeArgs = Parameters<typeof composeStory>

export interface A11yMatrixOptions {
  /** The story's default export (Meta). */
  meta: ComposeArgs[1]
  /** A single named story export from the same file. */
  story: ComposeArgs[0]
  /**
   * Nodes whose (truncated) outer HTML contains any of these substrings are recorded
   * and reported but NOT asserted on — a documented exemption for intentionally-muted
   * decorative elements (see the caller's comment). Actions must not be muted.
   */
  exemptHtmlIncludes?: string[]
  /** Themes to sweep (defaults to every built-in theme). */
  themes?: string[]
  /** Surfaces to paint the canvas with (defaults to all four). */
  surfaces?: SurfaceId[]
  /** Extra axe rule toggles merged over the harness defaults. */
  disabledRules?: Record<string, { enabled: boolean }>
  /** describe() label. */
  name?: string
}

/**
 * Runs a story through axe + APCA Bronze on every theme × surface, in a real browser
 * (Vitest browser mode). composeStory injects the theme/surface Storybook globals the
 * shared decorator reads, so this is the automated equivalent of flicking the toolbars
 * (or the `&globals=theme:x;surface:y` URL). Requires the consumer's
 * .storybook/vitest.setup to have called setProjectAnnotations with its preview.
 */
export function runA11yMatrix({
  meta,
  story,
  themes = DEFAULT_THEMES,
  surfaces = DEFAULT_SURFACES,
  disabledRules = {},
  exemptHtmlIncludes = [],
  name = 'Accessibility',
}: A11yMatrixOptions): void {
  const matrix = themes.flatMap((theme) => surfaces.map((surface) => ({ theme, surface })))

  afterEach(() => cleanup())

  describe(`${name} — theme × surface (axe + APCA Bronze)`, () => {
    for (const { theme, surface } of matrix) {
      test(`no violations on theme=${theme} surface=${surface}`, async (ctx) => {
        const Story = composeStory(story, meta, { initialGlobals: { theme, surface } })
        const { container } = render(<Story />)
        const violations = await runAxe(container, disabledRules)
        const records = collectViolationRecords(violations)
        // Flag exempt nodes (documented muted-decorative policy) — recorded + reported
        // by vitest-apca-reporter, but not asserted on. Everything else is enforced.
        for (const r of records) {
          if (exemptHtmlIncludes.some((s) => r.html.includes(s))) r.exempt = true
        }
        // Attach all records to the task BEFORE asserting, so the node-side reporter
        // builds the theme × surface artifact even for (especially for) failing cells.
        const taskMeta = ctx.task.meta as ApcaTaskMeta
        taskMeta.apca = { theme, surface, violations: records }
        const summary = summarizeRecords(records.filter((r) => !r.exempt))
        expect(summary, `\n${summary.join('\n')}`).toEqual([])
      })
    }
  })
}
