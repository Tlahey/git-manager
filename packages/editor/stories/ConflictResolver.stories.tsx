import type { Meta, StoryObj } from '@storybook/react'
import { expect, within, userEvent, waitFor } from 'storybook/test'
import { ConflictResolver, type MergeBlock } from '../src'

/** Consistent 3-way fixture: unchanged header, a genuine two-sided conflict, a theirs-only
 * addition and an ours-only modification — enough to exercise coloring, connector ribbons on
 * both gaps, and every accept/ignore flow.
 *
 * Line bookkeeping (theirs pane = 10 lines, ours pane = 8 lines):
 *   b1 unchanged      theirs 1-3   ours 1-3
 *   b2 both-different theirs 4     ours 4
 *   b3 unchanged      theirs 5-6   ours 5-6
 *   b4 theirs-only    theirs 7-8   ours (0 lines, insertion point 7)
 *   b5 unchanged      theirs 9     ours 7
 *   b6 ours-only      theirs 10    ours 8
 */
function sampleBlocks(): MergeBlock[] {
  return [
    {
      blockId: 1,
      kind: 'unchanged',
      oursStartLine: 1,
      oursLineCount: 3,
      theirsStartLine: 1,
      theirsLineCount: 3,
      oursLines: ["import { api } from './api'", '', 'export function main() {'],
      theirsLines: ["import { api } from './api'", '', 'export function main() {'],
    },
    {
      blockId: 2,
      kind: 'both-different',
      oursStartLine: 4,
      oursLineCount: 1,
      theirsStartLine: 4,
      theirsLineCount: 1,
      oursLines: ['  const retries = 2'],
      theirsLines: ['  const retries = 5'],
      baseLines: ['  const retries = 3'],
    },
    {
      blockId: 3,
      kind: 'unchanged',
      oursStartLine: 5,
      oursLineCount: 2,
      theirsStartLine: 5,
      theirsLineCount: 2,
      oursLines: ['  return api.run(retries)', '}'],
      theirsLines: ['  return api.run(retries)', '}'],
    },
    {
      blockId: 4,
      kind: 'theirs-only',
      oursStartLine: 7,
      oursLineCount: 0,
      theirsStartLine: 7,
      theirsLineCount: 2,
      oursLines: [],
      theirsLines: ['', "export const VERSION = '2.0'"],
      baseLines: [],
    },
    {
      blockId: 5,
      kind: 'unchanged',
      oursStartLine: 7,
      oursLineCount: 1,
      theirsStartLine: 9,
      theirsLineCount: 1,
      oursLines: ['// end'],
      theirsLines: ['// end'],
    },
    {
      blockId: 6,
      kind: 'ours-only',
      oursStartLine: 8,
      oursLineCount: 1,
      theirsStartLine: 10,
      theirsLineCount: 1,
      oursLines: ['export const debug = true'],
      theirsLines: ['export const debug = false'],
      baseLines: ['export const debug = false'],
    },
  ]
}

function joinPane(blocks: MergeBlock[], side: 'ours' | 'theirs'): string {
  return blocks.flatMap((b) => (side === 'ours' ? b.oursLines : b.theirsLines)).join('\n')
}

const blocks = sampleBlocks()
const theirsText = joinPane(blocks, 'theirs')
const oursText = joinPane(blocks, 'ours')

/** What the wand resolves to in the story: every non-conflicting change applied, the genuine
 * conflict left on its base text. */
const autoMergedText = [
  "import { api } from './api'",
  '',
  'export function main() {',
  '  const retries = 3',
  '  return api.run(retries)',
  '}',
  '',
  "export const VERSION = '2.0'",
  '// end',
  'export const debug = true',
].join('\n')

const meta = {
  title: 'CodeView/ConflictResolver',
  component: ConflictResolver,
  decorators: [
    (Story) => (
      <div
        style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}
        data-testid="story-root"
      >
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ConflictResolver>

export default meta
type Story = StoryObj<typeof meta>

/** Full 3-panel merge: incoming (left, read-only) | editable result | current (right,
 * read-only), driven by the block fixture above. */
export const ThreeWayMerge: Story = {
  args: {
    panels: [
      { content: theirsText, status: <span>Incoming — feature/http-retries</span> },
      { status: <span>Result — client.ts</span> },
      { content: oursText, status: <span>Current — main</span> },
    ],
    blocks,
    modelPathPrefix: 'story/three-way/client.ts',
    editor: { language: 'typescript', theme: 'vs-dark' },
    onAutoMerge: () => Promise.resolve(autoMergedText),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // 1. Verify the initial dropdown button text
    const dropdownBtn = canvas.getByTestId('merge-whitespace-dropdown-btn')
    await expect(dropdownBtn).toHaveTextContent('Do not ignore')

    // 2. Open the dropdown
    await userEvent.click(dropdownBtn)

    // 3. Locate and click the "Ignore whitespace" option in the dropdown list
    const ignoreOption = canvas.getByText('Ignore whitespace')
    await userEvent.click(ignoreOption)

    // 4. Verify that the dropdown closed and the button label has updated
    await expect(dropdownBtn).toHaveTextContent('Ignore whitespace')
  },
}

/** Simple side-by-side diff: 2 panels, read-only, block geometry computed live by Monaco's
 * own diff engine — no `blocks` input needed. */
export const TwoPanelDiff: Story = {
  args: {
    panels: [{ content: theirsText }, { content: oursText }],
    modelPathPrefix: 'story/two-way/client.ts',
    editor: { language: 'typescript', theme: 'vs-dark' },
  },
}

/** Toolbar trimmed down via the actions config: navigation and reset only. */
export const MinimalHeader: Story = {
  args: {
    ...ThreeWayMerge.args,
    modelPathPrefix: 'story/minimal-header/client.ts',
    header: {
      applyNonConflicting: false,
      autoMerge: false,
      whitespace: false,
      highlight: false,
      stats: false,
      recalculate: false,
    },
    onAutoMerge: undefined,
    onRecalculate: undefined,
  },
}

/** No toolbar at all — just the three panes and their connector gaps. */
export const NoHeader: Story = {
  args: {
    ...ThreeWayMerge.args,
    modelPathPrefix: 'story/no-header/client.ts',
    header: false,
  },
}

/** Story showcasing the editor with collapseUnchanged set to true on mount. */
const largeUnchangedLines = [
  '// Copyright (c) 2026 Git Manager Ltd. All rights reserved.',
  '// Dedicated header with lots of license boilerplate lines',
  '// to trigger the collapse threshold (> 6 lines).',
  "import React from 'react'",
  "import { useState } from 'react'",
  "import { Button } from '@git-manager/ui'",
  "import { api } from './api'",
  "import { utils } from './utils'",
  "import { logger } from './logger'",
  "import { config } from './config'",
  "import { auth } from './auth'",
  "import { i18n } from './i18n'",
  "import { theme } from './theme'",
  '// Some additional line to fill up space',
  '// and ensure we clearly see the folded lines',
  '// in the Monaco code editors.',
  '// Line 17',
  '// Line 18',
  '// Line 19',
  '// Line 20',
]

const largeBlocks: MergeBlock[] = [
  {
    blockId: 1,
    kind: 'unchanged',
    oursStartLine: 1,
    oursLineCount: 20,
    theirsStartLine: 1,
    theirsLineCount: 20,
    oursLines: largeUnchangedLines,
    theirsLines: largeUnchangedLines,
  },
  {
    blockId: 2,
    kind: 'both-different',
    oursStartLine: 21,
    oursLineCount: 1,
    theirsStartLine: 21,
    theirsLineCount: 1,
    oursLines: ['  const retries = 2'],
    theirsLines: ['  const retries = 5'],
    baseLines: ['  const retries = 3'],
  },
  {
    blockId: 3,
    kind: 'unchanged',
    oursStartLine: 22,
    oursLineCount: 2,
    theirsStartLine: 22,
    theirsLineCount: 2,
    oursLines: ['  return api.run(retries)', '}'],
    theirsLines: ['  return api.run(retries)', '}'],
  },
]

const largeTheirsText = joinPane(largeBlocks, 'theirs')
const largeOursText = joinPane(largeBlocks, 'ours')

export const CollapsedByDefault: Story = {
  args: {
    panels: [
      { content: largeTheirsText, status: <span>Incoming — feature/http-retries</span> },
      { status: <span>Result — client.ts</span> },
      { content: largeOursText, status: <span>Current — main</span> },
    ],
    blocks: largeBlocks,
    modelPathPrefix: 'story/collapsed-by-default/client.ts',
    editor: { language: 'typescript', theme: 'vs-dark' },
    onAutoMerge: () =>
      Promise.resolve(
        [...largeUnchangedLines, '  const retries = 3', '  return api.run(retries)', '}'].join('\n')
      ),
    defaultCollapseUnchanged: true,
  },
}

/** Same collapsible unchanged block as `CollapsedByDefault`, but staggered: an earlier
 * both-different header (4 lines on theirs, 1 on ours) pushes the big unchanged block — and
 * everything after it — down by 3 lines in theirs relative to ours. The collapsed region's
 * banner therefore sits at a different pixel Y in the theirs pane than in the ours pane, which
 * exercises the connector ribbon's sloped fill+border path (in the gap between panes) rather
 * than the degenerate case where both ends happen to line up. */
const staggeredHeaderTheirsLines = [
  '// Copyright (c) 2026 Git Manager Ltd. All rights reserved.',
  '// Extra line only present on the incoming side,',
  '// so the unchanged block below starts later here',
  '// than it does in the current side.',
]
const staggeredHeaderOursLines = ['// Copyright (c) 2026 Git Manager Ltd. All rights reserved.']

const staggeredBlocks: MergeBlock[] = [
  {
    blockId: 1,
    kind: 'both-different',
    oursStartLine: 1,
    oursLineCount: 1,
    theirsStartLine: 1,
    theirsLineCount: 4,
    oursLines: staggeredHeaderOursLines,
    theirsLines: staggeredHeaderTheirsLines,
    baseLines: staggeredHeaderOursLines,
  },
  {
    blockId: 2,
    kind: 'unchanged',
    oursStartLine: 2,
    oursLineCount: 20,
    theirsStartLine: 5,
    theirsLineCount: 20,
    oursLines: largeUnchangedLines,
    theirsLines: largeUnchangedLines,
  },
  {
    blockId: 3,
    kind: 'both-different',
    oursStartLine: 22,
    oursLineCount: 1,
    theirsStartLine: 25,
    theirsLineCount: 1,
    oursLines: ['  const retries = 2'],
    theirsLines: ['  const retries = 5'],
    baseLines: ['  const retries = 3'],
  },
  {
    blockId: 4,
    kind: 'unchanged',
    oursStartLine: 23,
    oursLineCount: 2,
    theirsStartLine: 26,
    theirsLineCount: 2,
    oursLines: ['  return api.run(retries)', '}'],
    theirsLines: ['  return api.run(retries)', '}'],
  },
]

const staggeredTheirsText = joinPane(staggeredBlocks, 'theirs')
const staggeredOursText = joinPane(staggeredBlocks, 'ours')

/** N distinct, numbered filler lines for a collapsible unchanged block — long enough (> 6 lines)
 * to trip the collapse threshold, with a label so each block reads differently in a snapshot. */
function fillerLines(label: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `// ${label} — line ${i + 1} of ${count}`)
}

/** Three long unchanged blocks, each individually collapsible, separated by tiny both-different
 * conflicts. This is the case the single-block collapse stories never exercised: with more than
 * one collapsed banner stacked down the panes, the connector wave for every region AFTER the
 * first must still line up with its banners. Regressions here show as a one-line vertical drift
 * of the 2nd/3rd wave relative to its banner strips. Panes stay perfectly aligned (all blocks
 * have equal line counts on both sides) so any offset is purely the collapse-geometry bug, not
 * cross-pane stagger. */
const unchangedA = fillerLines('block A', 14)
const unchangedB = fillerLines('block B', 14)
const unchangedC = fillerLines('block C', 14)

const multiCollapseBlocks: MergeBlock[] = [
  {
    blockId: 1,
    kind: 'unchanged',
    oursStartLine: 1,
    oursLineCount: 14,
    theirsStartLine: 1,
    theirsLineCount: 14,
    oursLines: unchangedA,
    theirsLines: unchangedA,
  },
  {
    blockId: 2,
    kind: 'both-different',
    oursStartLine: 15,
    oursLineCount: 1,
    theirsStartLine: 15,
    theirsLineCount: 1,
    oursLines: ['  const retries = 2'],
    theirsLines: ['  const retries = 5'],
    baseLines: ['  const retries = 3'],
  },
  {
    blockId: 3,
    kind: 'unchanged',
    oursStartLine: 16,
    oursLineCount: 14,
    theirsStartLine: 16,
    theirsLineCount: 14,
    oursLines: unchangedB,
    theirsLines: unchangedB,
  },
  {
    blockId: 4,
    kind: 'both-different',
    oursStartLine: 30,
    oursLineCount: 1,
    theirsStartLine: 30,
    theirsLineCount: 1,
    oursLines: ['  const timeout = 100'],
    theirsLines: ['  const timeout = 200'],
    baseLines: ['  const timeout = 50'],
  },
  {
    blockId: 5,
    kind: 'unchanged',
    oursStartLine: 31,
    oursLineCount: 14,
    theirsStartLine: 31,
    theirsLineCount: 14,
    oursLines: unchangedC,
    theirsLines: unchangedC,
  },
]

const multiCollapseTheirsText = joinPane(multiCollapseBlocks, 'theirs')
const multiCollapseOursText = joinPane(multiCollapseBlocks, 'ours')

/** Repro for the multi-region collapse offset bug: three collapsed unchanged blocks stacked down
 * the panes. The first wave lines up with its banners; the 2nd and 3rd drift by a line unless the
 * collapse geometry accounts for every banner zone above them. Snapshot this to lock the fix. */
export const CollapsedMultipleRegions: Story = {
  args: {
    panels: [
      { content: multiCollapseTheirsText, status: <span>Incoming — feature/http-retries</span> },
      { status: <span>Result — client.ts</span> },
      { content: multiCollapseOursText, status: <span>Current — main</span> },
    ],
    blocks: multiCollapseBlocks,
    modelPathPrefix: 'story/collapsed-multiple/client.ts',
    editor: { language: 'typescript', theme: 'vs-dark' },
    defaultCollapseUnchanged: true,
  },
}

export const CollapsedStaggeredAcrossPanels: Story = {
  args: {
    panels: [
      { content: staggeredTheirsText, status: <span>Incoming — feature/http-retries</span> },
      { status: <span>Result — client.ts</span> },
      { content: staggeredOursText, status: <span>Current — main</span> },
    ],
    blocks: staggeredBlocks,
    modelPathPrefix: 'story/collapsed-staggered/client.ts',
    editor: { language: 'typescript', theme: 'vs-dark' },
    onAutoMerge: () =>
      Promise.resolve(
        [
          ...staggeredHeaderOursLines,
          ...largeUnchangedLines,
          '  const retries = 3',
          '  return api.run(retries)',
          '}',
        ].join('\n')
      ),
    defaultCollapseUnchanged: true,
  },
}

/**
 * ── Two-panel ("double vue") diff scenarios ──────────────────────────────────────────────────
 * Everything below exercises `ConflictResolver`'s 2-panel (`isTwoWay`) mode specifically — the
 * plain read-only diff view (as opposed to the 3-panel merge stories above), now that the
 * desktop app's `DiffViewCenter` renders through it. Two things already traced in the source,
 * worth checking first when poking at these in Storybook's Interactions panel:
 *
 *  - `useMergeDecorations.ts` only computes intra-line (word-level) highlights when `!isTwoWay`,
 *    and `computeTwoWayVisuals` never receives `highlightMode` at all — so the "Highlight
 *    words"/"Highlight lines" dropdown is suspected to be a no-op here (see
 *    `TwoWayHighlightModeToggle`; the coloring difference needs an eyeball check, not just the
 *    button label).
 *  - `useTwoWayDiffView.ts` only ever passes `ignoreTrimWhitespace: whitespaceMode === 'ignore'`
 *    to the diff engine — so "Ignore leading/trailing whitespace" (trim) is suspected to compute
 *    the SAME diff as "Do not ignore" (compare), while "Ignore whitespace" is the only option
 *    that actually changes anything (see `TwoWayWhitespaceModes` — if its "trim" assertion
 *    fails, that confirms the bug).
 */

/** Single line modified in an otherwise unremarkable 6-line file — the simplest possible case. */
const modOriginal = [
  'export const TIMEOUT_MS = 3000',
  'export const MAX_RETRIES = 3',
  '',
  'export function withTimeout(fn) {',
  '  return Promise.race([fn(), sleep(TIMEOUT_MS)])',
  '}',
].join('\n')
const modModified = [
  'export const TIMEOUT_MS = 5000',
  'export const MAX_RETRIES = 3',
  '',
  'export function withTimeout(fn) {',
  '  return Promise.race([fn(), sleep(TIMEOUT_MS)])',
  '}',
].join('\n')

export const TwoWayModification: Story = {
  args: {
    panels: [{ content: modOriginal }, { content: modModified }],
    modelPathPrefix: 'story/two-way/modification.ts',
    editor: { language: 'typescript', theme: 'vs-dark' },
  },
}

/** Pure addition: every original line survives untouched, new lines appended at the end. */
const additionOriginal = [
  'function calculateTotal(items) {',
  '  return items.reduce((sum, item) => sum + item.price, 0)',
  '}',
].join('\n')
const additionModified = [
  'function calculateTotal(items) {',
  '  return items.reduce((sum, item) => sum + item.price, 0)',
  '}',
  '',
  'function calculateAverage(items) {',
  '  return calculateTotal(items) / items.length',
  '}',
].join('\n')

export const TwoWayAddition: Story = {
  args: {
    panels: [{ content: additionOriginal }, { content: additionModified }],
    modelPathPrefix: 'story/two-way/addition.ts',
    editor: { language: 'typescript', theme: 'vs-dark' },
  },
}

/** Pure deletion — the mirror of `TwoWayAddition`: swap which side is "original". */
export const TwoWayDeletion: Story = {
  args: {
    panels: [{ content: additionModified }, { content: additionOriginal }],
    modelPathPrefix: 'story/two-way/deletion.ts',
    editor: { language: 'typescript', theme: 'vs-dark' },
  },
}

/** Three independent, non-adjacent hunks in one file: a modification, a deletion, and an
 * addition — stresses multiple simultaneous connector ribbons stacked in the single gap, and
 * backs `TwoWayNavigation`'s exact hunk count below. */
const mixedOriginal = [
  'export const config = {',
  "  host: 'localhost',",
  '  port: 8080,',
  '  timeout: 3000,',
  '  retries: 3,',
  '  logging: {',
  "    level: 'info',",
  '    verbose: false,',
  '  },',
  '  cache: {',
  '    enabled: true,',
  '    ttl: 60,',
  '  },',
  '}',
].join('\n')
const mixedModified = [
  'export const config = {',
  "  host: 'localhost',",
  '  port: 9090,',
  '  timeout: 3000,',
  '  retries: 3,',
  '  logging: {',
  '  },',
  '  cache: {',
  '    enabled: true,',
  '    ttl: 60,',
  "    strategy: 'lru',",
  '    telemetry: false,',
  '  },',
  '}',
].join('\n')

export const TwoWayMixedChanges: Story = {
  args: {
    panels: [{ content: mixedOriginal }, { content: mixedModified }],
    modelPathPrefix: 'story/two-way/mixed.ts',
    editor: { language: 'typescript', theme: 'vs-dark' },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Always "0 conflicts" in two-way mode: every block is a plain diff hunk (`theirs-only`),
    // never a real two-sided conflict, so the merge-flavored stats wording only half-applies.
    await waitFor(() =>
      expect(canvas.getByTestId('merge-stats')).toHaveTextContent('3 changes. 0 conflicts.')
    )
  },
}

/** Identical content on both sides — the empty-diff edge case. */
export const TwoWayNoChanges: Story = {
  args: {
    panels: [{ content: modOriginal }, { content: modOriginal }],
    modelPathPrefix: 'story/two-way/no-changes.ts',
    editor: { language: 'typescript', theme: 'vs-dark' },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId('merge-stats')).toHaveTextContent('0 changes. 0 conflicts.')
    )
  },
}

/** No shared lines at all — a full file rewrite, the worst case for the diff engine (one giant
 * hunk instead of many small ones). */
export const TwoWayFullRewrite: Story = {
  args: {
    panels: [
      { content: mixedOriginal },
      {
        content: [
          '# Rewritten entirely in a different language/shape,',
          '# sharing not a single line with the original file.',
          'def build_config():',
          "    return {'host': 'localhost', 'port': 9090}",
        ].join('\n'),
      },
    ],
    modelPathPrefix: 'story/two-way/full-rewrite',
    editor: { language: 'typescript', theme: 'vs-dark' },
  },
}

/** New file: empty original, real content on the modified side. */
export const TwoWayNewFile: Story = {
  args: {
    panels: [{ content: '' }, { content: additionModified }],
    modelPathPrefix: 'story/two-way/new-file.ts',
    editor: { language: 'typescript', theme: 'vs-dark' },
  },
}

/** Deleted file: real content on the original side, empty modified side. */
export const TwoWayDeletedFile: Story = {
  args: {
    panels: [{ content: additionModified }, { content: '' }],
    modelPathPrefix: 'story/two-way/deleted-file.ts',
    editor: { language: 'typescript', theme: 'vs-dark' },
  },
}

/** Same collapsible-unchanged shape as the 3-way `CollapsedByDefault` story above, but through
 * the 2-panel path — checks the collapse banners/connector wave line up here too, not just in
 * 3-panel mode. */
const twoWayCollapseOriginal = [
  ...largeUnchangedLines,
  '  const retries = 5',
  '  return api.run(retries)',
  '}',
].join('\n')
const twoWayCollapseModified = [
  ...largeUnchangedLines,
  '  const retries = 2',
  '  return api.run(retries)',
  '}',
].join('\n')

export const TwoWayCollapseUnchanged: Story = {
  args: {
    panels: [{ content: twoWayCollapseOriginal }, { content: twoWayCollapseModified }],
    modelPathPrefix: 'story/two-way/collapsed.ts',
    editor: { language: 'typescript', theme: 'vs-dark' },
    defaultCollapseUnchanged: true,
  },
}

/** Whitespace-only change: line 2 gains trailing spaces, nothing else differs. "Ignore
 * whitespace" is expected to make the diff disappear — and per its label, so should "Ignore
 * leading/trailing whitespace" (trim). See the file-level comment above: this is the story that
 * catches the suspected compare/trim mixup. */
const wsOriginal = ['function greet(name) {', "  return 'Hello, ' + name", '}'].join('\n')
const wsModified = ['function greet(name) {', "  return 'Hello, ' + name   ", '}'].join('\n')

export const TwoWayWhitespaceModes: Story = {
  args: {
    panels: [{ content: wsOriginal }, { content: wsModified }],
    modelPathPrefix: 'story/two-way/whitespace.ts',
    editor: { language: 'typescript', theme: 'vs-dark' },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const dropdownBtn = canvas.getByTestId('merge-whitespace-dropdown-btn')

    await waitFor(() =>
      expect(canvas.getByTestId('merge-stats')).toHaveTextContent('1 change. 0 conflicts.')
    )

    await userEvent.click(dropdownBtn)
    await userEvent.click(canvas.getByText('Ignore whitespace'))
    await waitFor(() =>
      expect(canvas.getByTestId('merge-stats')).toHaveTextContent('0 changes. 0 conflicts.')
    )

    await userEvent.click(dropdownBtn)
    await userEvent.click(canvas.getByText('Ignore leading/trailing whitespace'))
    await waitFor(() =>
      expect(canvas.getByTestId('merge-stats')).toHaveTextContent('0 changes. 0 conflicts.')
    )
  },
}

/** Toggles highlight mode on a single-word modification. Per the file-level comment above,
 * switching "Highlight words"/"Highlight lines" is suspected to have zero visual effect in
 * two-way mode (unlike the 3-way stories) — this only asserts the dropdown's own state; inspect
 * the center pane's coloring by eye after each click to confirm the suspected no-op. */
const highlightOriginal = ['const label = "Submit"', 'export default label'].join('\n')
const highlightModified = ['const label = "Save"', 'export default label'].join('\n')

export const TwoWayHighlightModeToggle: Story = {
  args: {
    panels: [{ content: highlightOriginal }, { content: highlightModified }],
    modelPathPrefix: 'story/two-way/highlight-mode.ts',
    editor: { language: 'typescript', theme: 'vs-dark' },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const dropdownBtn = canvas.getByTestId('merge-highlight-dropdown-btn')
    await expect(dropdownBtn).toHaveTextContent('Highlight words')

    await userEvent.click(dropdownBtn)
    await userEvent.click(canvas.getByText('Highlight lines'))
    await expect(dropdownBtn).toHaveTextContent('Highlight lines')

    await userEvent.click(dropdownBtn)
    await userEvent.click(canvas.getByText('Highlight words'))
    await expect(dropdownBtn).toHaveTextContent('Highlight words')
  },
}

/** Change navigation across the three hunks from `TwoWayMixedChanges`: prev disabled at the
 * first change, next disabled at the last, both enabled in between. */
export const TwoWayNavigation: Story = {
  args: {
    panels: [{ content: mixedOriginal }, { content: mixedModified }],
    modelPathPrefix: 'story/two-way/navigation.ts',
    editor: { language: 'typescript', theme: 'vs-dark' },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const prevBtn = canvas.getByTestId('merge-nav-prev')
    const nextBtn = canvas.getByTestId('merge-nav-next')

    await waitFor(() => expect(prevBtn).toBeDisabled())
    await expect(nextBtn).toBeEnabled()

    await userEvent.click(nextBtn)
    await userEvent.click(nextBtn)
    await waitFor(() => expect(nextBtn).toBeDisabled())
    await expect(prevBtn).toBeEnabled()

    await userEvent.click(prevBtn)
    await expect(nextBtn).toBeEnabled()
  },
}
