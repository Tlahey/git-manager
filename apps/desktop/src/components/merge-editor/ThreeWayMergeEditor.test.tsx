import { createRef } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MergeBlock, ThreeWayMergeView } from '@git-manager/git-types'
import { ThreeWayMergeEditor, type ThreeWayMergeEditorRef } from './ThreeWayMergeEditor'
import { fakeEditors, resetFakeEditors } from './__tests__/fakeMonacoPane'

// `vi.mock` factories are hoisted above the imports, so they must not close over top-level
// bindings directly: the fake editor is pulled in via a dynamic import inside the factory, and
// the auto-merge spy is created through `vi.hoisted` so it exists before the factory runs.
vi.mock('../../lib/monacoSetup', async () => {
  const { FakeMonacoEditor } = await import('./__tests__/fakeMonacoPane')
  return {
    MonacoEditor: FakeMonacoEditor,
    languageForFilePath: () => 'plaintext',
  }
})
vi.mock('../../lib/monacoThemes', () => ({
  registerAndApplyDynamicTheme: () => {},
}))
vi.mock('../../stores/settings.store', () => ({
  useSettingsStore: (selector: (s: { settings: { appearance: { theme: string } } }) => unknown) =>
    selector({ settings: { appearance: { theme: 'dark' } } }),
}))

const apiAutoMergeConflictView = vi.hoisted(() => vi.fn<(repoPath: string, filePath: string) => Promise<string>>())
vi.mock('../../api/conflict.api', () => ({
  apiAutoMergeConflictView: (repoPath: string, filePath: string) => apiAutoMergeConflictView(repoPath, filePath),
}))

const REPO_PATH = '/repo'
const FILE_PATH = 'a.txt'
const oursPath = `${REPO_PATH}/${FILE_PATH}#ours`
const centerPath = `${REPO_PATH}/${FILE_PATH}#center`
const theirsPath = `${REPO_PATH}/${FILE_PATH}#theirs`

// header (unchanged), then a real two-sided conflict — the minimal fixture that exercises
// coloring, the connector ribbons on both gaps, and independent per-side toggling.
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

function conflictView(blocks: MergeBlock[] = conflictBlocks()): ThreeWayMergeView {
  return {
    filePath: FILE_PATH,
    renderable: true,
    isBinary: false,
    blocks,
    oursText: 'header\nours conflict',
    theirsText: 'header\ntheirs conflict',
    conflictCount: 1,
  }
}

/** One entry per decoration; each entry is that decoration's full (possibly multi-class, e.g.
 * `merge-text-conflict merge-border-top-conflict …`) className string. */
function decorationClasses(path: string): string[] {
  const decorations = fakeEditors.get(path)?.decorations as Array<{ options: { className?: string } }> | undefined
  return (decorations ?? []).map((d) => d.options.className).filter((c): c is string => Boolean(c))
}

function hasDecorationClass(path: string, className: string): boolean {
  return decorationClasses(path).some((c) => c.split(' ').includes(className))
}

/** The intra-line (character-precise) decorations only — those carrying an `inlineClassName`. */
function inlineDecorations(path: string) {
  const decorations = fakeEditors.get(path)?.decorations as
    | Array<{ range: { startColumn: number; endColumn: number }; options: { inlineClassName?: string } }>
    | undefined
  return (decorations ?? []).filter((d) => Boolean(d.options.inlineClassName))
}

beforeEach(() => {
  resetFakeEditors()
  apiAutoMergeConflictView.mockReset()
})

describe('ThreeWayMergeEditor — decorations', () => {
  it('colors the conflicting block red (a genuine two-sided conflict) on both sides and in the center, and never colors the unchanged header', async () => {
    render(<ThreeWayMergeEditor repoPath={REPO_PATH} filePath={FILE_PATH} view={conflictView()} />)

    await waitFor(() => {
      expect(hasDecorationClass(oursPath, 'merge-text-conflict')).toBe(true)
      expect(hasDecorationClass(theirsPath, 'merge-text-conflict')).toBe(true)
      expect(hasDecorationClass(centerPath, 'merge-text-conflict')).toBe(true)
    })

    // Only one decoration per pane: the header (block 1, unchanged) never gets a color class.
    expect(decorationClasses(oursPath)).toHaveLength(1)
    expect(decorationClasses(theirsPath)).toHaveLength(1)
  })

  it('pinpoints the exact differing word with intra-line highlights on the theirs pane and the center, none on ours', async () => {
    render(<ThreeWayMergeEditor repoPath={REPO_PATH} filePath={FILE_PATH} view={conflictView()} />)

    // 'ours conflict' vs 'theirs conflict': only the first word differs — "theirs" (cols 1–7)
    // on the theirs pane, "ours" (cols 1–5) on the center. Ours is included in the center, so
    // its own comparison is a no-op.
    await waitFor(() => {
      expect(inlineDecorations(theirsPath)).toMatchObject([
        { range: { startColumn: 1, endColumn: 7 }, options: { inlineClassName: 'merge-inline-conflict' } },
      ])
      expect(inlineDecorations(centerPath)).toMatchObject([
        { range: { startColumn: 1, endColumn: 5 }, options: { inlineClassName: 'merge-inline-conflict' } },
      ])
    })
    expect(inlineDecorations(oursPath)).toHaveLength(0)
  })

  it('draws no block borders by default', async () => {
    render(<ThreeWayMergeEditor repoPath={REPO_PATH} filePath={FILE_PATH} view={conflictView()} />)

    await waitFor(() => expect(hasDecorationClass(oursPath, 'merge-text-conflict')).toBe(true))
    expect(decorationClasses(oursPath).some((c) => c.includes('merge-border-'))).toBe(false)
  })

  it('closes the one-line conflict block hermetically when showBlockBorders is on: top and bottom border classes on its single decoration', async () => {
    render(<ThreeWayMergeEditor repoPath={REPO_PATH} filePath={FILE_PATH} view={conflictView()} showBlockBorders />)

    await waitFor(() => {
      expect(hasDecorationClass(oursPath, 'merge-border-top-conflict')).toBe(true)
      expect(hasDecorationClass(oursPath, 'merge-border-bottom-conflict')).toBe(true)
    })
  })

  it('renders one ribbon in each gap for the conflicting block, and none for the unchanged header', async () => {
    render(<ThreeWayMergeEditor repoPath={REPO_PATH} filePath={FILE_PATH} view={conflictView()} />)

    await waitFor(() => {
      expect(screen.getByTestId('merge-connector-ribbon-left-2')).toBeInTheDocument()
      expect(screen.getByTestId('merge-connector-ribbon-right-2')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('merge-connector-ribbon-left-1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('merge-connector-ribbon-right-1')).not.toBeInTheDocument()
  })
})

describe('ThreeWayMergeEditor — alignment view zones', () => {
  it('starts with no filler zones when every pane shows the same line count per block', async () => {
    render(<ThreeWayMergeEditor repoPath={REPO_PATH} filePath={FILE_PATH} view={conflictView()} />)

    await waitFor(() => expect(fakeEditors.get(centerPath)).toBeDefined())
    expect(fakeEditors.get(oursPath)!.viewZones).toHaveLength(0)
    expect(fakeEditors.get(centerPath)!.viewZones).toHaveLength(0)
    expect(fakeEditors.get(theirsPath)!.viewZones).toHaveLength(0)
  })

  it('injects hatched filler zones in the side panes once the center holds both sides (center grew taller)', async () => {
    const user = userEvent.setup()
    render(<ThreeWayMergeEditor repoPath={REPO_PATH} filePath={FILE_PATH} view={conflictView()} />)

    await waitFor(() => expect(screen.getByTestId('merge-connector-accept-right-2')).toBeInTheDocument())
    await user.click(screen.getByTestId('merge-connector-accept-right-2')) // keep both → center block is now 2 lines

    await waitFor(() => {
      // Each side pane shows 1 line for the block but the center now shows 2 → 1 filler line
      // each, right after the block's own content (line 2 in both side panes).
      expect(fakeEditors.get(oursPath)!.viewZones).toMatchObject([{ afterLineNumber: 2, heightInLines: 1 }])
      expect(fakeEditors.get(theirsPath)!.viewZones).toMatchObject([{ afterLineNumber: 2, heightInLines: 1 }])
    })
    // The center is the tallest pane for this block — no filler needed there.
    expect(fakeEditors.get(centerPath)!.viewZones).toHaveLength(0)
    expect(fakeEditors.get(oursPath)!.viewZones[0].domNode.className).toContain('merge-view-zone')
  })

  it('replaces zones instead of stacking them when placements change again', async () => {
    const user = userEvent.setup()
    render(<ThreeWayMergeEditor repoPath={REPO_PATH} filePath={FILE_PATH} view={conflictView()} />)

    await waitFor(() => expect(screen.getByTestId('merge-connector-accept-right-2')).toBeInTheDocument())
    await user.click(screen.getByTestId('merge-connector-accept-right-2')) // keep both
    await waitFor(() => expect(fakeEditors.get(oursPath)!.viewZones).toHaveLength(1))

    await user.click(screen.getByTestId('merge-connector-reject-left-2')) // back to 1 center line

    await waitFor(() => {
      expect(fakeEditors.get(oursPath)!.viewZones).toHaveLength(0)
      expect(fakeEditors.get(theirsPath)!.viewZones).toHaveLength(0)
      expect(fakeEditors.get(centerPath)!.viewZones).toHaveLength(0)
    })
  })
})

describe('ThreeWayMergeEditor — gutter actions (keep-both regression)', () => {
  it('lets both sides be accepted at once instead of one overwriting the other', async () => {
    const user = userEvent.setup()
    render(<ThreeWayMergeEditor repoPath={REPO_PATH} filePath={FILE_PATH} view={conflictView()} />)

    await waitFor(() => expect(screen.getByTestId('merge-connector-accept-right-2')).toBeInTheDocument())

    // Ours is included by default already; explicitly pull theirs in too.
    await user.click(screen.getByTestId('merge-connector-accept-right-2'))

    await waitFor(() => {
      expect(fakeEditors.get(centerPath)!.getModel().getValue()).toBe('header\nours conflict\ntheirs conflict')
    })
  })

  it('rejecting one side afterwards leaves the other side’s previously-accepted content intact', async () => {
    const user = userEvent.setup()
    render(<ThreeWayMergeEditor repoPath={REPO_PATH} filePath={FILE_PATH} view={conflictView()} />)

    await waitFor(() => expect(screen.getByTestId('merge-connector-accept-right-2')).toBeInTheDocument())
    await user.click(screen.getByTestId('merge-connector-accept-right-2')) // keep both
    await waitFor(() => expect(fakeEditors.get(centerPath)!.getModel().getValue()).toContain('theirs conflict'))

    await user.click(screen.getByTestId('merge-connector-reject-left-2')) // then reject ours only

    await waitFor(() => {
      expect(fakeEditors.get(centerPath)!.getModel().getValue()).toBe('header\ntheirs conflict')
    })
  })

  it('hides a side’s buttons once decided, without touching the other side’s buttons', async () => {
    const user = userEvent.setup()
    render(<ThreeWayMergeEditor repoPath={REPO_PATH} filePath={FILE_PATH} view={conflictView()} />)

    await waitFor(() => expect(screen.getByTestId('merge-connector-accept-left-2')).toBeInTheDocument())
    await user.click(screen.getByTestId('merge-connector-accept-left-2')) // decide ours (idempotent accept)

    await waitFor(() => {
      expect(screen.queryByTestId('merge-connector-accept-left-2')).not.toBeInTheDocument()
      expect(screen.queryByTestId('merge-connector-reject-left-2')).not.toBeInTheDocument()
    })
    // The theirs-side buttons in the other gap are unaffected.
    expect(screen.getByTestId('merge-connector-accept-right-2')).toBeInTheDocument()
    expect(screen.getByTestId('merge-connector-reject-right-2')).toBeInTheDocument()

    // But the ribbon itself stays, now settled (gray).
    expect(screen.getByTestId('merge-connector-ribbon-left-2')).toHaveClass('merge-connector-resolved')
  })
})

describe('ThreeWayMergeEditor — undo', () => {
  it('restores the previous placements (and re-shows the buttons) when the center edit is undone', async () => {
    const user = userEvent.setup()
    render(<ThreeWayMergeEditor repoPath={REPO_PATH} filePath={FILE_PATH} view={conflictView()} />)

    await waitFor(() => expect(screen.getByTestId('merge-connector-accept-right-2')).toBeInTheDocument())
    await user.click(screen.getByTestId('merge-connector-accept-right-2'))
    await waitFor(() => expect(fakeEditors.get(centerPath)!.getModel().getValue()).toContain('theirs conflict'))
    // The buttons live in the connector overlay, whose segments are recomputed in a rAF tick —
    // their disappearance is async even though the model text above updated synchronously.
    await waitFor(() => expect(screen.queryByTestId('merge-connector-accept-right-2')).not.toBeInTheDocument())

    // Simulate Monaco's own undo restoring the pre-action text (a real Ctrl+Z reverts the
    // model directly; ThreeWayMergeEditor only listens for the resulting content-change event).
    fakeEditors.get(centerPath)!.getModel().simulateExternalChange('header\nours conflict', { isUndoing: true })

    await waitFor(() => {
      expect(screen.getByTestId('merge-connector-accept-right-2')).toBeInTheDocument()
    })
  })
})

describe('ThreeWayMergeEditor — file switch', () => {
  it('resets placements/decorations to the new file instead of keeping the previous file’s state', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<ThreeWayMergeEditor repoPath={REPO_PATH} filePath={FILE_PATH} view={conflictView()} />)

    await waitFor(() => expect(screen.getByTestId('merge-connector-accept-right-2')).toBeInTheDocument())
    await user.click(screen.getByTestId('merge-connector-accept-right-2')) // decide something on file A
    await waitFor(() => expect(fakeEditors.get(centerPath)!.getModel().getValue()).toContain('theirs conflict'))

    const otherFilePath = 'b.txt'
    const otherBlocks: MergeBlock[] = [
      {
        blockId: 1,
        kind: 'both-different',
        oursStartLine: 1,
        oursLineCount: 1,
        theirsStartLine: 1,
        theirsLineCount: 1,
        oursLines: ['b ours'],
        theirsLines: ['b theirs'],
      },
    ]
    const otherView: ThreeWayMergeView = {
      filePath: otherFilePath,
      renderable: true,
      isBinary: false,
      blocks: otherBlocks,
      oursText: 'b ours',
      theirsText: 'b theirs',
      conflictCount: 1,
    }

    rerender(<ThreeWayMergeEditor repoPath={REPO_PATH} filePath={otherFilePath} view={otherView} />)

    const newCenterPath = `${REPO_PATH}/${otherFilePath}#center`
    await waitFor(() => {
      expect(fakeEditors.get(newCenterPath)!.getModel().getValue()).toBe('b ours')
    })
    // File B's block never had a decision made on it — its accept/reject buttons must be back,
    // not stuck hidden from whatever was decided on file A.
    await waitFor(() => {
      expect(screen.getByTestId('merge-connector-accept-right-1')).toBeInTheDocument()
      expect(screen.getByTestId('merge-connector-reject-left-1')).toBeInTheDocument()
    })
  })
})

describe('ThreeWayMergeEditor — auto-merge wand', () => {
  it('settles non-conflicting blocks and applies the backend-computed merged text, leaving real conflicts pending', async () => {
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
    const view: ThreeWayMergeView = {
      filePath: FILE_PATH,
      renderable: true,
      isBinary: false,
      blocks,
      oursText: 'ours addition\nheader\nours conflict',
      theirsText: 'header\ntheirs conflict',
      conflictCount: 1,
    }
    apiAutoMergeConflictView.mockResolvedValue('ours addition\nheader\nours conflict')

    const ref = createRef<ThreeWayMergeEditorRef>()
    render(<ThreeWayMergeEditor ref={ref} repoPath={REPO_PATH} filePath={FILE_PATH} view={view} />)
    await waitFor(() => expect(fakeEditors.get(centerPath)).toBeDefined())

    await ref.current!.applyAutoMerge()

    expect(apiAutoMergeConflictView).toHaveBeenCalledWith(REPO_PATH, FILE_PATH)
    // The addition block (blockId 1) is non-conflicting and settles — its own gutter action
    // disappears. The real conflict (now blockId 3) is left fully pending for the user.
    await waitFor(() => {
      expect(screen.queryByTestId('merge-connector-accept-left-1')).not.toBeInTheDocument()
      expect(screen.getByTestId('merge-connector-accept-left-3')).toBeInTheDocument()
    })
  })
})
