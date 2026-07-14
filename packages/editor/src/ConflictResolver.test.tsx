import { createRef, type Ref } from 'react'
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
    | Array<{ options: { className?: string } }>
    | undefined
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
  it('hides a long unchanged block’s middle lines and shows a collapsed-region banner, then expands it back on click', async () => {
    const unchangedLines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`)
    const blocks: MergeBlock[] = [
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
    const user = userEvent.setup()
    renderMerge(blocks)

    await waitFor(() => expect(fakeEditors.get(theirsPath)).toBeDefined())
    expect(fakeEditors.get(theirsPath)!.hiddenAreas).toEqual([])

    await user.click(screen.getByTestId('merge-collapse-unchanged-btn'))

    await waitFor(() => {
      const ranges = fakeEditors.get(theirsPath)!.hiddenAreas
      expect(ranges).toHaveLength(1)
      expect(ranges[0]).toMatchObject({ startLineNumber: 4, endLineNumber: 7 })
    })

    const banner = fakeEditors
      .get(theirsPath)!
      .viewZones.find((z) => z.domNode.getAttribute('data-collapsed-block-id') === '1')
    expect(banner).toBeDefined()

    fireEvent.click(banner!.domNode)

    await waitFor(() => {
      expect(fakeEditors.get(theirsPath)!.hiddenAreas).toEqual([])
    })
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
