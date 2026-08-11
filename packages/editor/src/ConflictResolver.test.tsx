import { StrictMode, createRef, type Ref } from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MergeBlock } from './types'
import {
  ConflictResolver,
  type ConflictResolverProps,
  type ConflictResolverRef,
} from './ConflictResolver'
import {
  FakeMonacoEditor,
  fakeEditors,
  fakeDiffEditors,
  fakeDiffSilent,
  fakeVisibleRange,
  resetFakeEditors,
} from './__tests__/fakeMonacoPane'

// `ConflictResolver` is the shared engine behind the desktop app's `ThreeWayMergeEditor` (a thin
// prop-translation wrapper, see apps/desktop/src/components/merge-editor/ThreeWayMergeEditor.tsx)
// — these tests exercise it directly, at the package level, using a fake Monaco editor/pane
// harness modeled on the desktop app's own
// apps/desktop/src/components/merge-editor/__tests__/fakeMonacoPane.tsx (extended here with a
// fake diff editor for 2-panel mode — see __tests__/fakeMonacoPane.tsx).

const MODEL_PREFIX = '/repo/a.txt'
const theirsPath = `${MODEL_PREFIX}#theirs`
const centerPath = `${MODEL_PREFIX}#center`
const oursPath = `${MODEL_PREFIX}#ours`

const DIFF_PREFIX = 'b.txt'
const originalPath = `${DIFF_PREFIX}.original`
const modifiedPath = `${DIFF_PREFIX}.modified`

function textFor(blocks: MergeBlock[], side: 'ours' | 'theirs'): string {
  return blocks.flatMap((b) => (side === 'ours' ? b.oursLines : b.theirsLines)).join('\n')
}

// header (unchanged), then a real two-sided conflict — the minimal fixture that exercises
// coloring, gutter actions on both gaps, and independent per-side toggling.
function conflictBlocks(): MergeBlock[] {
  return [
    {
      blockId: 1,
      kind: 'unchanged',
      oursStartLine: 1,
      oursLineCount: 1,
      theirsStartLine: 1,
      theirsLineCount: 1,
      oursLines: ['header'],
      theirsLines: ['header'],
    },
    {
      blockId: 2,
      kind: 'both-different',
      oursStartLine: 2,
      oursLineCount: 1,
      theirsStartLine: 2,
      theirsLineCount: 1,
      oursLines: ['ours conflict'],
      theirsLines: ['theirs conflict'],
    },
  ]
}

function renderMerge(
  blocks: MergeBlock[],
  overrides: Partial<ConflictResolverProps> = {},
  ref?: Ref<ConflictResolverRef>
) {
  const props: ConflictResolverProps = {
    panels: [
      { content: textFor(blocks, 'theirs') },
      { content: '' },
      { content: textFor(blocks, 'ours') },
    ],
    blocks,
    modelPathPrefix: MODEL_PREFIX,
    editor: { component: FakeMonacoEditor },
    ...overrides,
  }
  return render(<ConflictResolver ref={ref} {...props} />)
}

function renderDiff(
  original: string,
  modified: string,
  overrides: Partial<ConflictResolverProps> = {}
) {
  const props: ConflictResolverProps = {
    panels: [{ content: original }, { content: modified }],
    modelPathPrefix: DIFF_PREFIX,
    editor: { component: FakeMonacoEditor },
    ...overrides,
  }
  return render(<ConflictResolver {...props} />)
}

/** One entry per decoration; each entry is that decoration's full (possibly multi-class, e.g.
 * `merge-text-conflict merge-border-top-conflict …`) className string. */
function decorationClasses(path: string): string[] {
  const decorations = fakeEditors.get(path)?.decorations as
    Array<{ options: { className?: string } }> | undefined
  return (decorations ?? []).map((d) => d.options.className).filter((c): c is string => Boolean(c))
}

function hasDecorationClass(path: string, className: string): boolean {
  return decorationClasses(path).some((c) => c.split(' ').includes(className))
}

/** The intra-line (character-precise) decorations only — those carrying an `inlineClassName`. */
function inlineDecorations(path: string) {
  const decorations = fakeEditors.get(path)?.decorations as
    | Array<{
        range: { startColumn: number; endColumn: number }
        options: { inlineClassName?: string }
      }>
    | undefined
  return (decorations ?? []).filter((d) => Boolean(d.options.inlineClassName))
}

beforeEach(() => {
  resetFakeEditors()
})

// `handlePaneMount` schedules a couple of un-cancelled "belt and suspenders" follow-up
// `setTimeout(…, 250)` recomputes on every mount (see ConflictResolver.tsx) that outlive
// `cleanup()`'s unmount. Left unhandled, whichever one is still pending when this file's jsdom
// environment tears down fires into a torn-down realm (`requestAnimationFrame` no longer
// defined) — an unhandled exception, not a test failure, but still worth not leaving dangling.
// Waiting once here, after the last test, lets any such timer fire while the environment is
// still alive instead.
afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 300))
})

describe('ConflictResolver — 3-panel decorations', () => {
  it('colors the conflicting block red on both sides and in the center, and never colors the unchanged header', async () => {
    renderMerge(conflictBlocks())

    await waitFor(() => {
      expect(hasDecorationClass(oursPath, 'merge-text-conflict')).toBe(true)
      expect(hasDecorationClass(theirsPath, 'merge-text-conflict')).toBe(true)
      expect(hasDecorationClass(centerPath, 'merge-text-conflict')).toBe(true)
    })
    expect(decorationClasses(oursPath)).toHaveLength(1)
    expect(decorationClasses(theirsPath)).toHaveLength(1)
  })

  it('shows intra-line word highlights by default and clears them when the header switches to line-only highlighting', async () => {
    const user = userEvent.setup()
    renderMerge(conflictBlocks())

    await waitFor(() => {
      expect(inlineDecorations(theirsPath)).toHaveLength(1)
      expect(inlineDecorations(centerPath)).toHaveLength(1)
    })

    await user.click(screen.getByTestId('merge-highlight-dropdown-btn'))
    await user.click(screen.getByText('Highlight lines'))

    await waitFor(() => {
      expect(inlineDecorations(theirsPath)).toHaveLength(0)
      expect(inlineDecorations(centerPath)).toHaveLength(0)
    })
  })

  it('draws no block borders by default, but adds top/bottom border classes when showBlockBorders is on', async () => {
    const { rerender } = renderMerge(conflictBlocks())

    await waitFor(() => expect(hasDecorationClass(oursPath, 'merge-text-conflict')).toBe(true))
    expect(decorationClasses(oursPath).some((c) => c.includes('merge-border-'))).toBe(false)

    rerender(
      <ConflictResolver
        panels={[
          { content: textFor(conflictBlocks(), 'theirs') },
          { content: '' },
          { content: textFor(conflictBlocks(), 'ours') },
        ]}
        blocks={conflictBlocks()}
        modelPathPrefix={MODEL_PREFIX}
        editor={{ component: FakeMonacoEditor }}
        showBlockBorders
      />
    )

    await waitFor(() => {
      expect(hasDecorationClass(oursPath, 'merge-border-top-conflict')).toBe(true)
      expect(hasDecorationClass(oursPath, 'merge-border-bottom-conflict')).toBe(true)
    })
  })
})

describe('ConflictResolver — connector gutter actions', () => {
  it('lets both sides be accepted at once instead of one overwriting the other', async () => {
    const user = userEvent.setup()
    renderMerge(conflictBlocks())

    await waitFor(() =>
      expect(screen.getByTestId('merge-connector-accept-left-2')).toBeInTheDocument()
    )
    await user.click(screen.getByTestId('merge-connector-accept-left-2')) // pull theirs (left gap) in too

    await waitFor(() => {
      expect(fakeEditors.get(centerPath)!.getModel().getValue()).toBe(
        'header\nours conflict\ntheirs conflict'
      )
    })
  })

  it('rejecting one side afterwards leaves the other side’s previously-accepted content intact', async () => {
    const user = userEvent.setup()
    renderMerge(conflictBlocks())

    await waitFor(() =>
      expect(screen.getByTestId('merge-connector-accept-left-2')).toBeInTheDocument()
    )
    await user.click(screen.getByTestId('merge-connector-accept-left-2')) // keep both
    await waitFor(() =>
      expect(fakeEditors.get(centerPath)!.getModel().getValue()).toContain('theirs conflict')
    )

    await user.click(screen.getByTestId('merge-connector-reject-right-2')) // then reject ours only

    await waitFor(() => {
      expect(fakeEditors.get(centerPath)!.getModel().getValue()).toBe('header\ntheirs conflict')
    })
  })

  it('hides a side’s buttons once decided and marks its ribbon resolved, without touching the other gap', async () => {
    const user = userEvent.setup()
    renderMerge(conflictBlocks())

    await waitFor(() =>
      expect(screen.getByTestId('merge-connector-accept-right-2')).toBeInTheDocument()
    )
    await user.click(screen.getByTestId('merge-connector-accept-right-2')) // idempotent accept, right gap

    await waitFor(() => {
      expect(screen.queryByTestId('merge-connector-accept-right-2')).not.toBeInTheDocument()
      expect(screen.queryByTestId('merge-connector-reject-right-2')).not.toBeInTheDocument()
    })
    expect(screen.getByTestId('merge-connector-accept-left-2')).toBeInTheDocument()
    expect(screen.getByTestId('merge-connector-reject-left-2')).toBeInTheDocument()

    expect(screen.getByTestId('merge-connector-ribbon-right-2-top')).toHaveClass(
      'merge-connector-conflict'
    )
    expect(screen.getByTestId('merge-connector-ribbon-right-2-top')).toHaveClass('merge-resolved')
  })

  it('only offers actions on the side that authored a one-sided change — the mirror pane has no buttons', async () => {
    const blocks: MergeBlock[] = [
      {
        blockId: 1,
        kind: 'ours-only',
        oursStartLine: 1,
        oursLineCount: 1,
        theirsStartLine: 1,
        theirsLineCount: 1,
        oursLines: ['ours modified'],
        theirsLines: ['original'],
      },
    ]
    renderMerge(blocks)

    await waitFor(() =>
      expect(screen.getByTestId('merge-connector-accept-right-1')).toBeInTheDocument()
    )
    expect(screen.queryByTestId('merge-connector-accept-left-1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('merge-connector-reject-left-1')).not.toBeInTheDocument()
  })

  it('resolves a one-sided block exclusively: accepting theirs swaps the block to theirs’ content', async () => {
    const blocks: MergeBlock[] = [
      {
        blockId: 1,
        kind: 'theirs-only',
        oursStartLine: 1,
        oursLineCount: 1,
        theirsStartLine: 1,
        theirsLineCount: 1,
        oursLines: ['original'],
        theirsLines: ['theirs modified'],
      },
    ]
    const user = userEvent.setup()
    renderMerge(blocks)

    await waitFor(() =>
      expect(screen.getByTestId('merge-connector-accept-left-1')).toBeInTheDocument()
    )
    await user.click(screen.getByTestId('merge-connector-accept-left-1'))

    await waitFor(() => {
      expect(fakeEditors.get(centerPath)!.getModel().getValue()).toBe('theirs modified')
    })
  })

  it('ignoring a one-sided change restores the other (ancestor-mirroring) side instead of leaving the block empty', async () => {
    const blocks: MergeBlock[] = [
      {
        blockId: 1,
        kind: 'ours-only',
        oursStartLine: 1,
        oursLineCount: 1,
        theirsStartLine: 1,
        theirsLineCount: 1,
        oursLines: ['ours modified'],
        theirsLines: ['original'],
      },
    ]
    const user = userEvent.setup()
    renderMerge(blocks)

    await waitFor(() =>
      expect(screen.getByTestId('merge-connector-reject-right-1')).toBeInTheDocument()
    )
    await user.click(screen.getByTestId('merge-connector-reject-right-1'))

    await waitFor(() => {
      expect(fakeEditors.get(centerPath)!.getModel().getValue()).toBe('original')
    })
  })
})

describe('ConflictResolver — header apply-non-conflicting buttons', () => {
  function mixedApplyBlocks(): MergeBlock[] {
    return [
      {
        blockId: 1,
        kind: 'theirs-only',
        oursStartLine: 1,
        oursLineCount: 0,
        theirsStartLine: 1,
        theirsLineCount: 1,
        oursLines: [],
        theirsLines: ['theirs addition'],
      },
      {
        blockId: 2,
        kind: 'ours-only',
        oursStartLine: 1,
        oursLineCount: 1,
        theirsStartLine: 2,
        theirsLineCount: 0,
        oursLines: ['ours addition'],
        theirsLines: [],
      },
      {
        blockId: 3,
        kind: 'both-different',
        oursStartLine: 2,
        oursLineCount: 1,
        theirsStartLine: 3,
        theirsLineCount: 1,
        oursLines: ['ours conflict'],
        theirsLines: ['theirs conflict'],
      },
    ]
  }

  it('Left resolves only the theirs-only ("left") non-conflicting block, leaving ours-only and the real conflict pending', async () => {
    const user = userEvent.setup()
    renderMerge(mixedApplyBlocks())

    await waitFor(() => {
      expect(screen.getByTestId('merge-connector-accept-left-1')).toBeInTheDocument()
      expect(screen.getByTestId('merge-connector-accept-right-2')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('merge-apply-left-btn'))

    await waitFor(() =>
      expect(screen.queryByTestId('merge-connector-accept-left-1')).not.toBeInTheDocument()
    )
    expect(screen.getByTestId('merge-connector-accept-right-2')).toBeInTheDocument()
    expect(screen.getByTestId('merge-connector-accept-left-3')).toBeInTheDocument()
    expect(screen.getByTestId('merge-connector-accept-right-3')).toBeInTheDocument()
  })

  it('Right resolves only the ours-only ("right") non-conflicting block, leaving theirs-only and the real conflict pending', async () => {
    const user = userEvent.setup()
    renderMerge(mixedApplyBlocks())

    await waitFor(() =>
      expect(screen.getByTestId('merge-connector-accept-right-2')).toBeInTheDocument()
    )

    await user.click(screen.getByTestId('merge-apply-right-btn'))

    await waitFor(() =>
      expect(screen.queryByTestId('merge-connector-accept-right-2')).not.toBeInTheDocument()
    )
    expect(screen.getByTestId('merge-connector-accept-left-1')).toBeInTheDocument()
    expect(screen.getByTestId('merge-connector-accept-left-3')).toBeInTheDocument()
  })

  it('All resolves both non-conflicting blocks and applies their merged text, leaving the real conflict at its default', async () => {
    const user = userEvent.setup()
    renderMerge(mixedApplyBlocks())

    await waitFor(() =>
      expect(screen.getByTestId('merge-connector-accept-left-1')).toBeInTheDocument()
    )

    await user.click(screen.getByTestId('merge-apply-all-btn'))

    await waitFor(() => {
      expect(fakeEditors.get(centerPath)!.getModel().getValue()).toBe(
        'theirs addition\nours addition\nours conflict'
      )
    })
    // The buttons live in the connector overlay, whose segments are recomputed in a rAF tick —
    // their disappearance is async even though the model text above updated synchronously.
    await waitFor(() => {
      expect(screen.queryByTestId('merge-connector-accept-left-1')).not.toBeInTheDocument()
      expect(screen.queryByTestId('merge-connector-accept-right-2')).not.toBeInTheDocument()
    })
    // The genuine conflict is untouched by "apply non-conflicting".
    expect(screen.getByTestId('merge-connector-accept-left-3')).toBeInTheDocument()
  })
})

describe('ConflictResolver — header reset button', () => {
  it('restores initial placements/text and re-shows buttons after a decision was made', async () => {
    const user = userEvent.setup()
    renderMerge(conflictBlocks())

    await waitFor(() =>
      expect(screen.getByTestId('merge-connector-accept-left-2')).toBeInTheDocument()
    )
    await user.click(screen.getByTestId('merge-connector-accept-left-2'))
    await waitFor(() =>
      expect(fakeEditors.get(centerPath)!.getModel().getValue()).toContain('theirs conflict')
    )
    await waitFor(() =>
      expect(screen.queryByTestId('merge-connector-accept-left-2')).not.toBeInTheDocument()
    )

    await user.click(screen.getByTestId('merge-reset-btn'))

    await waitFor(() => {
      expect(fakeEditors.get(centerPath)!.getModel().getValue()).toBe('header\nours conflict')
    })
    await waitFor(() =>
      expect(screen.getByTestId('merge-connector-accept-left-2')).toBeInTheDocument()
    )
  })
})

describe('ConflictResolver — header auto-merge wand', () => {
  it('settles non-conflicting blocks and applies the host-computed merged text, leaving real conflicts pending', async () => {
    const blocks: MergeBlock[] = [
      {
        blockId: 1,
        kind: 'ours-only',
        oursStartLine: 1,
        oursLineCount: 1,
        theirsStartLine: 1,
        theirsLineCount: 0,
        oursLines: ['ours addition'],
        theirsLines: [],
      },
      ...conflictBlocks().map((b) => ({ ...b, blockId: b.blockId + 1 })),
    ]
    const onAutoMerge = vi.fn().mockResolvedValue('ours addition\nheader\nours conflict')
    const user = userEvent.setup()
    renderMerge(blocks, { onAutoMerge })

    await waitFor(() => expect(screen.getByTestId('merge-wand-btn')).toBeInTheDocument())
    await user.click(screen.getByTestId('merge-wand-btn'))

    expect(onAutoMerge).toHaveBeenCalledOnce()
    await waitFor(() => {
      expect(screen.getByTestId('merge-connector-accept-right-1')).toBeInTheDocument() // addition stays pending
      expect(screen.getByTestId('merge-connector-accept-left-3')).toBeInTheDocument() // real conflict (now blockId 3) stays pending
    })
  })

  it('does not render the wand at all when onAutoMerge is not provided', async () => {
    renderMerge(conflictBlocks())
    await waitFor(() => expect(fakeEditors.get(centerPath)).toBeDefined())
    expect(screen.queryByTestId('merge-wand-btn')).not.toBeInTheDocument()
  })
})

describe('ConflictResolver — undo/redo history bookkeeping', () => {
  it('restores the previous placements (and re-shows the buttons) when the center edit is undone', async () => {
    const user = userEvent.setup()
    renderMerge(conflictBlocks())

    await waitFor(() =>
      expect(screen.getByTestId('merge-connector-accept-left-2')).toBeInTheDocument()
    )
    await user.click(screen.getByTestId('merge-connector-accept-left-2'))
    await waitFor(() =>
      expect(fakeEditors.get(centerPath)!.getModel().getValue()).toContain('theirs conflict')
    )
    await waitFor(() =>
      expect(screen.queryByTestId('merge-connector-accept-left-2')).not.toBeInTheDocument()
    )

    // Simulate Monaco's own undo restoring the pre-action text.
    fakeEditors
      .get(centerPath)!
      .getModel()
      .simulateExternalChange('header\nours conflict', { isUndoing: true })

    await waitFor(() => {
      expect(screen.getByTestId('merge-connector-accept-left-2')).toBeInTheDocument()
    })
  })

  it('restores the previous placements on undo when a gutter action did not change any text (rejecting a deletion)', async () => {
    const user = userEvent.setup()
    const blocks: MergeBlock[] = [
      {
        blockId: 1,
        kind: 'ours-only',
        oursStartLine: 1,
        oursLineCount: 0,
        theirsStartLine: 1,
        theirsLineCount: 1,
        oursLines: [],
        theirsLines: ['original line'],
      },
    ]
    renderMerge(blocks)

    await waitFor(() =>
      expect(screen.getByTestId('merge-connector-reject-right-1')).toBeInTheDocument()
    )
    await user.click(screen.getByTestId('merge-connector-reject-right-1')) // resolves without changing text (already "original line")
    await waitFor(() =>
      expect(screen.queryByTestId('merge-connector-reject-right-1')).not.toBeInTheDocument()
    )

    fakeEditors.get(centerPath)!.trigger('keyboard', 'undo', null)

    await waitFor(() => {
      expect(screen.getByTestId('merge-connector-reject-right-1')).toBeInTheDocument()
    })
  })

  it('redo re-applies an undone gutter action', async () => {
    const user = userEvent.setup()
    renderMerge(conflictBlocks())

    await waitFor(() =>
      expect(screen.getByTestId('merge-connector-accept-left-2')).toBeInTheDocument()
    )
    await user.click(screen.getByTestId('merge-connector-accept-left-2'))
    await waitFor(() =>
      expect(fakeEditors.get(centerPath)!.getModel().getValue()).toContain('theirs conflict')
    )

    fakeEditors
      .get(centerPath)!
      .getModel()
      .simulateExternalChange('header\nours conflict', { isUndoing: true })
    await waitFor(() =>
      expect(screen.getByTestId('merge-connector-accept-left-2')).toBeInTheDocument()
    )

    fakeEditors
      .get(centerPath)!
      .getModel()
      .simulateExternalChange('header\nours conflict\ntheirs conflict', { isRedoing: true })

    await waitFor(() => {
      expect(screen.queryByTestId('merge-connector-accept-left-2')).not.toBeInTheDocument()
    })
  })
})

describe('ConflictResolver — collapse-unchanged toggle', () => {
  // One long unchanged run followed by a real conflict — enough context for the collapse to have
  // something to hide (lines 4-7 of the 10 unchanged ones, keeping a few on each side).
  function collapsibleBlocks(): MergeBlock[] {
    const unchangedLines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`)
    return [
      {
        blockId: 1,
        kind: 'unchanged',
        oursStartLine: 1,
        oursLineCount: 10,
        theirsStartLine: 1,
        theirsLineCount: 10,
        oursLines: unchangedLines,
        theirsLines: unchangedLines,
      },
      {
        blockId: 2,
        kind: 'both-different',
        oursStartLine: 11,
        oursLineCount: 1,
        theirsStartLine: 11,
        theirsLineCount: 1,
        oursLines: ['ours conflict'],
        theirsLines: ['theirs conflict'],
      },
    ]
  }

  it('hides a long unchanged block’s middle lines out of the box, and expands it back when its banner is clicked', async () => {
    renderMerge(collapsibleBlocks())

    await waitFor(() => expect(fakeEditors.get(theirsPath)).toBeDefined())

    // Collapsed with no host opt-in: `defaultCollapseUnchanged` is on unless a host passes false.
    await waitFor(() => {
      const ranges = fakeEditors.get(theirsPath)!.hiddenAreas
      expect(ranges).toHaveLength(1)
      expect(ranges[0]).toMatchObject({ startLineNumber: 4, endLineNumber: 7 })
    })

    // The visible "N lines collapsed" banner is a Monaco overlay widget (viewport-width, doesn't
    // scroll with content) — the view zone itself is now just an invisible space-reserving spacer.
    const banner = fakeEditors
      .get(theirsPath)!
      .overlayWidgets.find((w) => w.getDomNode().getAttribute('data-collapsed-block-id') === '1')
    expect(banner).toBeDefined()

    fireEvent.click(banner!.getDomNode())

    await waitFor(() => {
      expect(fakeEditors.get(theirsPath)!.hiddenAreas).toEqual([])
    })
  })

  it('starts expanded when the host opts out, and the header toggle collapses it', async () => {
    const user = userEvent.setup()
    renderMerge(collapsibleBlocks(), { defaultCollapseUnchanged: false })

    await waitFor(() => expect(fakeEditors.get(theirsPath)).toBeDefined())
    expect(fakeEditors.get(theirsPath)!.hiddenAreas).toEqual([])

    await user.click(screen.getByTestId('merge-collapse-unchanged-btn'))

    await waitFor(() => {
      const ranges = fakeEditors.get(theirsPath)!.hiddenAreas
      expect(ranges).toHaveLength(1)
      expect(ranges[0]).toMatchObject({ startLineNumber: 4, endLineNumber: 7 })
    })
  })
})

/* The gutter actions and the collapsed banner used to hardcode their own English names, which
 * made them unreachable for a translated host — the French app read them in English. They are
 * `labels` entries now, and the side→name choice moved from the overlay (which only knew "left
 * gap") up to the resolver (which knows the left gap pulls the incoming side in). */
describe('ConflictResolver — accessible names', () => {
  function collapsibleBlocks(): MergeBlock[] {
    const unchangedLines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`)
    return [
      {
        blockId: 1,
        kind: 'unchanged',
        oursStartLine: 1,
        oursLineCount: 10,
        theirsStartLine: 1,
        theirsLineCount: 10,
        oursLines: unchangedLines,
        theirsLines: unchangedLines,
      },
    ]
  }

  it('names each gap’s accept button after the side that gap pulls from', async () => {
    renderMerge(conflictBlocks())

    await waitFor(() => expect(screen.getByTestId('merge-connector-accept-left-2')).toBeDefined())
    expect(screen.getByTestId('merge-connector-accept-left-2')).toHaveAccessibleName(
      'Accept incoming change'
    )
    expect(screen.getByTestId('merge-connector-accept-right-2')).toHaveAccessibleName(
      'Accept current change'
    )
    expect(screen.getByTestId('merge-connector-reject-left-2')).toHaveAccessibleName(
      'Ignore this change'
    )
  })

  it('lets the host override every gutter-action name', async () => {
    renderMerge(conflictBlocks(), {
      labels: {
        acceptIncomingLabel: 'Accepter la modification entrante',
        acceptCurrentLabel: 'Accepter la modification actuelle',
        ignoreChangeLabel: 'Ignorer cette modification',
      },
    })

    await waitFor(() => expect(screen.getByTestId('merge-connector-accept-left-2')).toBeDefined())
    expect(screen.getByTestId('merge-connector-accept-left-2')).toHaveAccessibleName(
      'Accepter la modification entrante'
    )
    expect(screen.getByTestId('merge-connector-accept-right-2')).toHaveAccessibleName(
      'Accepter la modification actuelle'
    )
    expect(screen.getByTestId('merge-connector-reject-left-2')).toHaveAccessibleName(
      'Ignorer cette modification'
    )
  })

  it('gives the collapsed banner a real button with a name, not a bare div', async () => {
    renderMerge(collapsibleBlocks())

    await waitFor(() => expect(fakeEditors.get(theirsPath)).toBeDefined())
    await waitFor(() => expect(fakeEditors.get(theirsPath)!.hiddenAreas).toHaveLength(1))

    const banner = fakeEditors
      .get(theirsPath)!
      .overlayWidgets.find((w) => w.getDomNode().getAttribute('data-collapsed-block-id') === '1')!
      .getDomNode()

    // A div could be clicked but never focused or activated from the keyboard.
    expect(banner.tagName).toBe('BUTTON')
    expect(banner).toHaveAccessibleName('4 lines collapsed')
  })

  it('lets the host translate and pluralise the collapsed banner', async () => {
    renderMerge(collapsibleBlocks(), {
      labels: { collapsedLinesLabel: (count) => `${count} lignes repliées` },
    })

    await waitFor(() => expect(fakeEditors.get(theirsPath)).toBeDefined())
    await waitFor(() => expect(fakeEditors.get(theirsPath)!.hiddenAreas).toHaveLength(1))

    const banner = fakeEditors
      .get(theirsPath)!
      .overlayWidgets.find((w) => w.getDomNode().getAttribute('data-collapsed-block-id') === '1')!
      .getDomNode()

    expect(banner).toHaveAccessibleName('4 lignes repliées')
    expect(banner.textContent).toBe('4 lignes repliées')
  })
})

describe('ConflictResolver — 2-panel diff mode', () => {
  it('computes a dynamic diff from the fake Monaco diff editor: a one-line modification renders as a modification', async () => {
    renderDiff('line1\noriginal line\nline3', 'line1\nmodified line\nline3')

    await waitFor(() => expect(fakeEditors.get(modifiedPath)).toBeDefined())

    // blockId 0 is the synthesized unchanged gap for 'line1'; the real change is blockId 1.
    await waitFor(() => {
      expect(screen.getByTestId('merge-connector-ribbon-left-1')).toHaveClass(
        'merge-connector-modification'
      )
    })
    expect(hasDecorationClass(originalPath, 'merge-text-modification')).toBe(true)
    expect(hasDecorationClass(modifiedPath, 'merge-text-modification')).toBe(true)
    // No action buttons: 2-panel mode is a read-only diff, never actionable.
    expect(screen.queryByTestId('merge-connector-accept-left-1')).not.toBeInTheDocument()
  })

  it('a pure insertion is decorated as an addition, with a boundary marker on the original pane', async () => {
    renderDiff('line1\nline2', 'line1\nnew line\nline2')

    await waitFor(() => expect(fakeEditors.get(modifiedPath)).toBeDefined())

    // blockId 0 is the synthesized unchanged gap for 'line1'; the real change is blockId 1.
    await waitFor(() => {
      expect(screen.getByTestId('merge-connector-ribbon-left-1')).toHaveClass(
        'merge-connector-addition'
      )
    })
    expect(
      decorationClasses(originalPath).some((c) => /^merge-marker-(top|bottom)-addition$/.test(c))
    ).toBe(true)
  })

  it('a pure deletion is decorated as a deletion, with a boundary marker on the modified pane', async () => {
    renderDiff('line1\nold line\nline2', 'line1\nline2')

    await waitFor(() => expect(fakeEditors.get(modifiedPath)).toBeDefined())

    // blockId 0 is the synthesized unchanged gap for 'line1'; the real change is blockId 1.
    await waitFor(() => {
      expect(screen.getByTestId('merge-connector-ribbon-left-1')).toHaveClass(
        'merge-connector-deletion'
      )
    })
    expect(
      decorationClasses(modifiedPath).some((c) => /^merge-marker-(top|bottom)-deletion$/.test(c))
    ).toBe(true)
  })

  it('identical original/modified content produces no ribbon at all', async () => {
    renderDiff('line1\nline2\nline3', 'line1\nline2\nline3')

    await waitFor(() => expect(fakeEditors.get(modifiedPath)).toBeDefined())
    // Give the (fake) async diff computation a tick to have settled either way.
    await waitFor(() => expect(fakeDiffEditors.length).toBeGreaterThan(0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(screen.queryByTestId('merge-connector-ribbon-left-0')).not.toBeInTheDocument()
  })

  it('ignoring whitespace via the header dropdown treats a pure-whitespace difference as no change', async () => {
    const user = userEvent.setup()
    renderDiff('line1\n  indented\nline3', 'line1\nindented\nline3')

    await waitFor(() => expect(fakeEditors.get(modifiedPath)).toBeDefined())
    // blockId 0 is the synthesized unchanged gap for 'line1'; the real change is blockId 1.
    await waitFor(() =>
      expect(screen.getByTestId('merge-connector-ribbon-left-1')).toBeInTheDocument()
    )
    expect(fakeDiffEditors).toHaveLength(1)

    await user.click(screen.getByTestId('merge-whitespace-dropdown-btn'))
    await user.click(screen.getByText('Ignore whitespace'))

    // Once whitespace is ignored the two files match entirely — the whole file collapses into
    // one synthesized unchanged block (blockId 0), which never gets a ribbon.
    await waitFor(() => {
      expect(screen.queryByTestId('merge-connector-ribbon-left-0')).not.toBeInTheDocument()
      expect(screen.queryByTestId('merge-connector-ribbon-left-1')).not.toBeInTheDocument()
    })
    // Switching modes tears down the old diff editor and creates a fresh one with the new option.
    expect(fakeDiffEditors).toHaveLength(2)
    expect(fakeDiffEditors[0].disposed).toBe(true)
  })
})

describe('ConflictResolver — imperative ref API', () => {
  it('getCenterValue reflects the live center buffer, including manual edits', async () => {
    const ref = createRef<ConflictResolverRef>()
    renderMerge(conflictBlocks(), {}, ref)

    await waitFor(() => expect(fakeEditors.get(centerPath)).toBeDefined())
    expect(ref.current!.getCenterValue()).toBe('header\nours conflict')

    fakeEditors.get(centerPath)!.getModel().simulateExternalChange('header\nedited by hand')
    expect(ref.current!.getCenterValue()).toBe('header\nedited by hand')
  })

  it('applyAutoMerge invokes onAutoMerge and applies its merged text, leaving real conflicts pending', async () => {
    const blocks: MergeBlock[] = [
      {
        blockId: 1,
        kind: 'ours-only',
        oursStartLine: 1,
        oursLineCount: 1,
        theirsStartLine: 1,
        theirsLineCount: 0,
        oursLines: ['ours addition'],
        theirsLines: [],
      },
      ...conflictBlocks().map((b) => ({ ...b, blockId: b.blockId + 1 })),
    ]
    const onAutoMerge = vi.fn().mockResolvedValue('ours addition\nheader\nours conflict')
    const ref = createRef<ConflictResolverRef>()
    renderMerge(blocks, { onAutoMerge }, ref)

    await waitFor(() => expect(fakeEditors.get(centerPath)).toBeDefined())
    await ref.current!.applyAutoMerge()

    expect(onAutoMerge).toHaveBeenCalledOnce()
    await waitFor(() => {
      expect(screen.getByTestId('merge-connector-accept-right-1')).toBeInTheDocument()
      expect(screen.getByTestId('merge-connector-accept-left-3')).toBeInTheDocument()
    })
  })

  it('acceptLeft resolves every block to the left/theirs side', async () => {
    const ref = createRef<ConflictResolverRef>()
    renderMerge(conflictBlocks(), {}, ref)
    await waitFor(() => expect(fakeEditors.get(centerPath)).toBeDefined())

    ref.current!.acceptLeft()

    await waitFor(() => {
      expect(fakeEditors.get(centerPath)!.getModel().getValue()).toBe('header\ntheirs conflict')
    })
  })

  it('acceptRight resolves every block to the right/ours side', async () => {
    const ref = createRef<ConflictResolverRef>()
    renderMerge(conflictBlocks(), {}, ref)
    await waitFor(() => expect(fakeEditors.get(centerPath)).toBeDefined())

    ref.current!.acceptLeft() // flip away from the default first, to prove acceptRight isn't a no-op
    await waitFor(() =>
      expect(fakeEditors.get(centerPath)!.getModel().getValue()).toBe('header\ntheirs conflict')
    )

    ref.current!.acceptRight()

    await waitFor(() => {
      expect(fakeEditors.get(centerPath)!.getModel().getValue()).toBe('header\nours conflict')
    })
  })

  it('goToNextChange/goToPreviousChange reveal successive change blocks and stop at the boundaries', async () => {
    const blocks: MergeBlock[] = [
      {
        blockId: 1,
        kind: 'unchanged',
        oursStartLine: 1,
        oursLineCount: 1,
        theirsStartLine: 1,
        theirsLineCount: 1,
        oursLines: ['header'],
        theirsLines: ['header'],
      },
      {
        blockId: 2,
        kind: 'both-different',
        oursStartLine: 2,
        oursLineCount: 1,
        theirsStartLine: 2,
        theirsLineCount: 1,
        oursLines: ['ours a'],
        theirsLines: ['theirs a'],
      },
      {
        blockId: 3,
        kind: 'unchanged',
        oursStartLine: 3,
        oursLineCount: 1,
        theirsStartLine: 3,
        theirsLineCount: 1,
        oursLines: ['mid'],
        theirsLines: ['mid'],
      },
      {
        blockId: 4,
        kind: 'both-different',
        oursStartLine: 4,
        oursLineCount: 1,
        theirsStartLine: 4,
        theirsLineCount: 1,
        oursLines: ['ours b'],
        theirsLines: ['theirs b'],
      },
    ]
    const ref = createRef<ConflictResolverRef>()
    renderMerge(blocks, {}, ref)
    await waitFor(() => expect(fakeEditors.get(centerPath)).toBeDefined())

    expect(fakeEditors.get(centerPath)!.lastRevealedLine).toBeNull()

    ref.current!.goToNextChange() // active block starts on the first change (block 2) → next is block 4
    await waitFor(() => expect(fakeEditors.get(centerPath)!.lastRevealedLine).toBe(4))

    ref.current!.goToNextChange() // already at the last change block — boundary, no-op
    expect(fakeEditors.get(centerPath)!.lastRevealedLine).toBe(4)

    ref.current!.goToPreviousChange() // back to block 2
    await waitFor(() => expect(fakeEditors.get(centerPath)!.lastRevealedLine).toBe(2))

    ref.current!.goToPreviousChange() // already at the first change block — boundary, no-op
    expect(fakeEditors.get(centerPath)!.lastRevealedLine).toBe(2)
  })
})

describe('ConflictResolver — panel resizing', () => {
  function mockContainerWidth(el: HTMLElement, width: number) {
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      width,
      height: 600,
      top: 0,
      left: 0,
      bottom: 600,
      right: width,
      x: 0,
      y: 0,
      toJSON: () => {},
    })
  }

  it('renders resize handles/panels with initial flex styles and resizes on a normal drag', async () => {
    renderMerge(conflictBlocks())

    const theirsWrapper = screen.getByTestId('merge-pane-theirs-wrapper')
    const centerWrapper = screen.getByTestId('merge-pane-center-wrapper')
    const oursWrapper = screen.getByTestId('merge-pane-ours-wrapper')
    const leftHandle = screen.getByTestId('merge-resize-handle-left')
    const rightHandle = screen.getByTestId('merge-resize-handle-right')

    expect(theirsWrapper.style.flex).toBe('33.333 1 0%')
    expect(centerWrapper.style.flex).toBe('33.334 1 0%')
    expect(oursWrapper.style.flex).toBe('33.333 1 0%')
    expect(leftHandle.style.cursor).toBe('col-resize')
    expect(rightHandle.style.cursor).toBe('col-resize')

    mockContainerWidth(theirsWrapper.parentElement!, 1080)

    const getFlexGrow = (el: HTMLElement) => parseFloat(el.style.flex.split(' ')[0])

    fireEvent.mouseDown(leftHandle, { clientX: 200 })
    fireEvent.mouseMove(window, { clientX: 300 })

    // panelsWidth = 1080 - 2*40 = 1000; dx=100 -> dPct=10
    expect(getFlexGrow(theirsWrapper)).toBeCloseTo(43.333, 3)
    expect(getFlexGrow(centerWrapper)).toBeCloseTo(23.334, 3)
    expect(getFlexGrow(oursWrapper)).toBeCloseTo(33.333, 3)

    fireEvent.mouseUp(window)
  })

  it('clamps the left-handle drag to the minimum pane width instead of shrinking past it', async () => {
    renderMerge(conflictBlocks())

    const theirsWrapper = screen.getByTestId('merge-pane-theirs-wrapper')
    const centerWrapper = screen.getByTestId('merge-pane-center-wrapper')
    const leftHandle = screen.getByTestId('merge-resize-handle-left')
    mockContainerWidth(theirsWrapper.parentElement!, 1080)
    const getFlexGrow = (el: HTMLElement) => parseFloat(el.style.flex.split(' ')[0])

    fireEvent.mouseDown(leftHandle, { clientX: 200 })
    fireEvent.mouseMove(window, { clientX: -5000 }) // huge negative drag
    fireEvent.mouseUp(window)

    // minPct = min(33.3, 150/1000*100) = 15; center absorbs the rest of the original sum (66.667).
    expect(getFlexGrow(theirsWrapper)).toBeCloseTo(15, 3)
    expect(getFlexGrow(centerWrapper)).toBeCloseTo(51.667, 3)
  })

  it('clamps the right-handle drag to the minimum pane width instead of shrinking past it', async () => {
    renderMerge(conflictBlocks())

    const centerWrapper = screen.getByTestId('merge-pane-center-wrapper')
    const oursWrapper = screen.getByTestId('merge-pane-ours-wrapper')
    const rightHandle = screen.getByTestId('merge-resize-handle-right')
    mockContainerWidth(centerWrapper.parentElement!, 1080)
    const getFlexGrow = (el: HTMLElement) => parseFloat(el.style.flex.split(' ')[0])

    fireEvent.mouseDown(rightHandle, { clientX: 800 })
    fireEvent.mouseMove(window, { clientX: 6000 }) // huge positive drag pushes "ours" toward the minimum
    fireEvent.mouseUp(window)

    expect(getFlexGrow(oursWrapper)).toBeCloseTo(15, 3)
    expect(getFlexGrow(centerWrapper)).toBeCloseTo(51.667, 3)
  })

  it('renders only the left resize handle in 2-panel mode (no third pane to bound on the right)', async () => {
    renderDiff('line1\nline2', 'line1\nline2')
    await waitFor(() => expect(fakeEditors.get(modifiedPath)).toBeDefined())

    expect(screen.getByTestId('merge-resize-handle-left')).toBeInTheDocument()
    expect(screen.queryByTestId('merge-resize-handle-right')).not.toBeInTheDocument()
  })
})

describe('theme-derived chrome', () => {
  it("publishes the theirs pane's real Monaco background as --merge-editor-background and keeps it synced", async () => {
    const { container } = renderMerge(conflictBlocks())
    const root = container.firstElementChild as HTMLElement
    const theirsDomNode = fakeEditors.get(theirsPath)!.getDomNode()

    // Whatever Monaco actually paints — never a hardcoded dark hex. The inter-pane gaps and the
    // collapsed-region label read this property, so they stay seamless with the panes in every
    // theme (see handlePaneMount / styles.css).
    expect(root.style.getPropertyValue('--merge-editor-background')).toBe('rgba(0, 0, 0, 0)')

    // A theme switch mutates the editor's own style/class; the MutationObserver re-reads it.
    theirsDomNode.style.backgroundColor = 'rgb(17, 9, 34)'

    await waitFor(() =>
      expect(root.style.getPropertyValue('--merge-editor-background')).toBe('rgb(17, 9, 34)')
    )
    expect(screen.getByTestId('merge-pane-theirs-wrapper').style.backgroundColor).toBe(
      'rgb(17, 9, 34)'
    )
  })
})

describe('ConflictResolver — StrictMode double-mount', () => {
  // The desktop app renders under `<React.StrictMode>`, which double-invokes effects on mount
  // (mount → cleanup → mount). Nothing else in this suite — nor Storybook, nor the Playwright
  // visual baselines — mounts that way, which is exactly how a latched `scheduleRecompute` guard
  // shipped: the connector `<svg>` was rendered with no `<path>` inside it in the real app while
  // every other environment kept drawing ribbons. See useMergeConnectors' cleanup.
  it('still computes connector ribbons when effects are double-invoked', async () => {
    render(
      <StrictMode>
        <ConflictResolver
          panels={[
            { content: 'line1\noriginal line\nline3' },
            { content: 'line1\nmodified line\nline3' },
          ]}
          modelPathPrefix={DIFF_PREFIX}
          editor={{ component: FakeMonacoEditor }}
        />
      </StrictMode>
    )

    await waitFor(() => expect(fakeEditors.get(modifiedPath)).toBeDefined())
    await waitFor(() => {
      expect(screen.getByTestId('merge-connector-ribbon-left-1')).toHaveClass(
        'merge-connector-modification'
      )
    })
  })
})

describe('ConflictResolver — connector windowing', () => {
  /** `count` alternating unchanged/conflict blocks — a long diff, the shape a regenerated
   * lockfile produces. */
  function manyBlocks(count: number): MergeBlock[] {
    return Array.from({ length: count }, (_, i) => ({
      blockId: i,
      kind: i % 2 === 0 ? ('unchanged' as const) : ('both-different' as const),
      oursStartLine: i + 1,
      oursLineCount: 1,
      theirsStartLine: i + 1,
      theirsLineCount: 1,
      oursLines: [`ours ${i}`],
      theirsLines: [`theirs ${i}`],
    }))
  }

  it('mounts only the ribbons near the viewport, not one per hunk', async () => {
    // The regression guard for the freeze: the overlay used to keep one SVG <path> per change
    // block in the DOM and rewrite every one of them on every scroll event. jsdom reports a
    // 0px-tall container, so what stays mounted here is purely the overscan band.
    const blocks = manyBlocks(400)
    renderMerge(blocks)

    await waitFor(() => expect(fakeEditors.get(centerPath)).toBeDefined())
    await waitFor(() =>
      expect(screen.queryByTestId('merge-connector-ribbon-left-1')).toBeInTheDocument()
    )

    const mounted = document.querySelectorAll('[data-testid^="merge-connector-ribbon-left-"]')
    expect(mounted.length).toBeGreaterThan(0)
    expect(mounted.length).toBeLessThan(60)

    // A hunk hundreds of lines below the fold has no business being in the document.
    expect(screen.queryByTestId('merge-connector-ribbon-left-399')).not.toBeInTheDocument()
  })

  it('still mounts every ribbon of a diff that fits in the band', async () => {
    // The windowing must be invisible on ordinary diffs — nothing is dropped just because the
    // feature exists.
    const blocks = manyBlocks(6)
    renderMerge(blocks)

    await waitFor(() => expect(fakeEditors.get(centerPath)).toBeDefined())
    await waitFor(() =>
      expect(screen.getByTestId('merge-connector-ribbon-left-1')).toBeInTheDocument()
    )
    expect(screen.getByTestId('merge-connector-ribbon-left-3')).toBeInTheDocument()
    expect(screen.getByTestId('merge-connector-ribbon-left-5')).toBeInTheDocument()
  })
})

describe('ConflictResolver — intra-line highlight scoping', () => {
  /** `count` conflicting blocks, each a one-line rewrite that shares a token with its counterpart
   * so the word-level pass has something to highlight. */
  function rewriteBlocks(count: number): MergeBlock[] {
    return Array.from({ length: count }, (_, i) => ({
      blockId: i,
      kind: 'both-different' as const,
      oursStartLine: i + 1,
      oursLineCount: 1,
      theirsStartLine: i + 1,
      theirsLineCount: 1,
      oursLines: [`alpha value ${i}`],
      theirsLines: [`beta value ${i}`],
    }))
  }

  function intraDecorationCount(path: string): number {
    const pane = fakeEditors.get(path)
    const decorations = (pane?.decorations ?? []) as { options?: { inlineClassName?: string } }[]
    return decorations.filter((d) => d.options?.inlineClassName).length
  }

  it('computes word-level highlights only around the visible range', async () => {
    // The cost this bounds is per changed *line* (a Myers diff per side↔center pair), which over a
    // whole file is unbounded — 76ms measured on a 6000-hunk diff, all of it for lines off screen.
    fakeVisibleRange.current = { start: 1, end: 10 }
    renderMerge(rewriteBlocks(400))

    await waitFor(() => expect(fakeEditors.get(theirsPath)).toBeDefined())
    await waitFor(() => expect(intraDecorationCount(theirsPath)).toBeGreaterThan(0))

    // 10 visible lines plus the overscan — nowhere near all 400 blocks.
    expect(intraDecorationCount(theirsPath)).toBeLessThan(120)
  })

  it('falls back to the whole file when the pane reports no visible range yet', async () => {
    // A pane that hasn't laid out reports nothing; highlighting everything is correct then, just
    // not bounded — and it is what keeps a freshly mounted editor from looking unhighlighted.
    fakeVisibleRange.current = null
    renderMerge(rewriteBlocks(400))

    await waitFor(() => expect(fakeEditors.get(theirsPath)).toBeDefined())
    await waitFor(() => expect(intraDecorationCount(theirsPath)).toBeGreaterThan(300))
  })

  it('still highlights every line of a diff small enough to fit the viewport', async () => {
    fakeVisibleRange.current = { start: 1, end: 3 }
    renderMerge(rewriteBlocks(3))

    await waitFor(() => expect(fakeEditors.get(theirsPath)).toBeDefined())
    await waitFor(() => expect(intraDecorationCount(theirsPath)).toBe(3))
  })
})

/* Three properties that together are what "no flicker" means here, each one a mechanism that used to
 * paint an intermediate state. They are asserted at the seams rather than through a delay, because
 * every attempt to hide these states behind a timed gate mis-guessed the delay in one direction or
 * the other. */
describe('ConflictResolver — nothing paints before it is whole', () => {
  const longOriginal = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n')
  const longModified = longOriginal.replace('line 15', 'LINE 15')
  const NEXT_PREFIX = 'next.txt'

  it('paints no text at all until the first file has its geometry', async () => {
    renderDiff(longOriginal, longModified)

    // Synchronously: the pane exists and holds nothing. Painting the raw file here is what showed
    // the whole thing uncollapsed for a moment, with the collapse snapping in after.
    expect(fakeEditors.get(originalPath)!.getModel().getValue()).toBe('')

    await waitFor(() =>
      expect(fakeEditors.get(originalPath)!.getModel().getValue()).toBe(longOriginal)
    )
    // ...and when the text does arrive, it arrives already collapsed.
    expect(fakeEditors.get(originalPath)!.hiddenAreas.length).toBeGreaterThan(0)
  })

  it('says it is loading over that deliberately empty pane, when the host gave it something to say', async () => {
    renderDiff(longOriginal, longModified, {
      editor: { component: FakeMonacoEditor, loadingFallback: <span>Loading the diff…</span> },
    })

    expect(screen.getByTestId('merge-panes-loading')).toBeInTheDocument()
    expect(screen.getByText('Loading the diff…')).toBeInTheDocument()

    await waitFor(() => expect(screen.queryByTestId('merge-panes-loading')).not.toBeInTheDocument())
  })

  it('reports no change counts while there is nothing to count, rather than zero', async () => {
    renderDiff(longOriginal, longModified)

    // "0 changes" is a claim about the file. Making it before the diff exists means the toolbar says
    // something false and then corrects itself — the panes' own flicker, one row up.
    expect(screen.queryByTestId('merge-stats')).not.toBeInTheDocument()

    await waitFor(() => expect(screen.getByTestId('merge-stats')).toBeInTheDocument())
    expect(screen.getByTestId('merge-stats').textContent).toContain('1 change')
  })

  it('still paints the file when the host’s diff never answers', async () => {
    // An unlaid-out host (this package's Storybook) leaves Monaco's detached diff editor silent
    // forever. Waiting for geometry must not turn that into a file that never shows.
    fakeDiffSilent.current = true
    renderDiff(longOriginal, longModified)

    expect(fakeEditors.get(originalPath)!.getModel().getValue()).toBe('')

    await waitFor(
      () => expect(fakeEditors.get(originalPath)!.getModel().getValue()).toBe(longOriginal),
      { timeout: 2000 }
    )
    // Uncollapsed, since there is no geometry to collapse by — the honest degraded state.
    expect(fakeEditors.get(originalPath)!.hiddenAreas).toEqual([])
  })

  it('keeps the previous file’s models attached until the new file’s geometry lands', async () => {
    const { rerender } = renderDiff(longOriginal, longModified)
    await waitFor(() =>
      expect(fakeEditors.get(originalPath)!.getModel().getValue()).toBe(longOriginal)
    )

    rerender(
      <ConflictResolver
        panels={[{ content: 'gamma\ndelta' }, { content: 'gamma\nDELTA' }]}
        modelPathPrefix={NEXT_PREFIX}
        editor={{ component: FakeMonacoEditor }}
      />
    )

    /* The model path is what this is about. Taken straight from props it changes on the click, so
     * Monaco swapped models — and a model swap takes the view model with it, which is where hidden
     * areas live and what owns every view zone. The old file was left on screen fully expanded,
     * fold banners floating, until the new file's contents and diff arrived. A new pane at the new
     * path existing here at all is that bug. */
    expect(fakeEditors.has(`${NEXT_PREFIX}.original`)).toBe(false)
    expect(fakeEditors.get(originalPath)!.hiddenAreas.length).toBeGreaterThan(0)

    await waitFor(() => expect(fakeEditors.has(`${NEXT_PREFIX}.original`)).toBe(true))
    expect(fakeEditors.get(`${NEXT_PREFIX}.original`)!.getModel().getValue()).toBe('gamma\ndelta')
  })

  it('forces Monaco to paint the collapse in the same task it was applied in', async () => {
    renderDiff(longOriginal, longModified)

    await waitFor(() =>
      expect(fakeEditors.get(originalPath)!.hiddenAreas.length).toBeGreaterThan(0)
    )
    // Monaco would otherwise render the hidden areas on an animation frame of its own, leaving the
    // browser free to paint the uncollapsed pane first. `render(true)` is what removes that window.
    expect(fakeEditors.get(originalPath)!.renderCalls).toContain(true)
  })
})

describe('ConflictResolver — switching files in 2-panel mode', () => {
  function renderDiff(original: string, modified: string) {
    return render(
      <ConflictResolver
        panels={[{ content: original }, { content: modified }]}
        modelPathPrefix={DIFF_PREFIX}
        editor={{ component: FakeMonacoEditor }}
      />
    )
  }

  it('holds the previous file on screen until the new one has its diff geometry', async () => {
    // Monaco answers the diff asynchronously. Painting the new text before its blocks exist means
    // painting it uncollapsed and undecorated, with the collapse snapping in a frame later — the
    // flicker. The panes therefore show the text the *current* geometry describes.
    const { rerender } = renderDiff('alpha\nbeta', 'alpha\nBETA')
    await waitFor(() => expect(fakeEditors.get(originalPath)).toBeDefined())
    await waitFor(() =>
      expect(fakeEditors.get(originalPath)!.getModel().getValue()).toBe('alpha\nbeta')
    )

    rerender(
      <ConflictResolver
        panels={[{ content: 'gamma\ndelta' }, { content: 'gamma\nDELTA' }]}
        modelPathPrefix={DIFF_PREFIX}
        editor={{ component: FakeMonacoEditor }}
      />
    )

    // Synchronously after the prop change, before the diff microtask lands: still the old file.
    expect(fakeEditors.get(originalPath)!.getModel().getValue()).toBe('alpha\nbeta')
    expect(fakeEditors.get(modifiedPath)!.getModel().getValue()).toBe('alpha\nBETA')
  })

  it('swaps to the new file once its geometry is ready', async () => {
    const { rerender } = renderDiff('alpha\nbeta', 'alpha\nBETA')
    await waitFor(() => expect(fakeEditors.get(originalPath)).toBeDefined())

    rerender(
      <ConflictResolver
        panels={[{ content: 'gamma\ndelta' }, { content: 'gamma\nDELTA' }]}
        modelPathPrefix={DIFF_PREFIX}
        editor={{ component: FakeMonacoEditor }}
      />
    )

    await waitFor(() =>
      expect(fakeEditors.get(originalPath)!.getModel().getValue()).toBe('gamma\ndelta')
    )
    expect(fakeEditors.get(modifiedPath)!.getModel().getValue()).toBe('gamma\nDELTA')
  })

  it('collapses the new file in the same commit as its content, never a frame later', async () => {
    // 30 identical lines around one change: long enough for the collapse-unchanged pass to hide a
    // middle. The assertion is that hidden areas are already applied for the *new* content by the
    // time that content is on screen.
    const longOriginal = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n')
    const longModified = longOriginal.replace('line 15', 'LINE 15')

    const { rerender } = renderDiff('a', 'b')
    await waitFor(() => expect(fakeEditors.get(originalPath)).toBeDefined())

    rerender(
      <ConflictResolver
        panels={[{ content: longOriginal }, { content: longModified }]}
        modelPathPrefix={DIFF_PREFIX}
        editor={{ component: FakeMonacoEditor }}
      />
    )

    await waitFor(() =>
      expect(fakeEditors.get(originalPath)!.getModel().getValue()).toBe(longOriginal)
    )
    expect(fakeEditors.get(originalPath)!.hiddenAreas.length).toBeGreaterThan(0)
  })
})
