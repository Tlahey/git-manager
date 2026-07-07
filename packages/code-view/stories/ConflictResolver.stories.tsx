import type { Meta, StoryObj } from '@storybook/react'
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
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }} data-testid="story-root">
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
}

/** Simple side-by-side diff: 2 panels, read-only, block geometry computed live by Monaco's
 * own diff engine — no `blocks` input needed. */
export const TwoPanelDiff: Story = {
  args: {
    panels: [
      { content: theirsText },
      { content: oursText },
    ],
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
