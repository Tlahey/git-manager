import { createRef } from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
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

const apiAutoMergeConflictView = vi.hoisted(() =>
  vi.fn<(repoPath: string, filePath: string) => Promise<string>>()
)
vi.mock('../../api/conflict.api', () => ({
  apiAutoMergeConflictView: (repoPath: string, filePath: string) =>
    apiAutoMergeConflictView(repoPath, filePath),
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
        {
          range: { startColumn: 1, endColumn: 7 },
          options: { inlineClassName: 'merge-inline-conflict' },
        },
      ])
      expect(inlineDecorations(centerPath)).toMatchObject([
        {
          range: { startColumn: 1, endColumn: 5 },
          options: { inlineClassName: 'merge-inline-conflict' },
        },
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
    render(
      <ThreeWayMergeEditor
        repoPath={REPO_PATH}
        filePath={FILE_PATH}
        view={conflictView()}
        showBlockBorders
      />
    )

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

  it('injects no filler zones in the side panes once the center holds both sides (hatched view zones disabled)', async () => {
    const user = userEvent.setup()
    render(<ThreeWayMergeEditor repoPath={REPO_PATH} filePath={FILE_PATH} view={conflictView()} />)

    // Theirs (incoming) sits in the LEFT gap, WebStorm-style.
    await waitFor(() =>
      expect(screen.getByTestId('merge-connector-accept-left-2')).toBeInTheDocument()
    )
    await user.click(screen.getByTestId('merge-connector-accept-left-2')) // keep both → center block is now 2 lines

    await waitFor(() => {
      expect(fakeEditors.get(oursPath)!.viewZones).toHaveLength(0)
      expect(fakeEditors.get(theirsPath)!.viewZones).toHaveLength(0)
    })

    // The center is the tallest pane for this block — no filler needed there.
    expect(fakeEditors.get(centerPath)!.viewZones).toHaveLength(0)
  })

  it('maintains zero zones when placements change again', async () => {
    const user = userEvent.setup()
    render(<ThreeWayMergeEditor repoPath={REPO_PATH} filePath={FILE_PATH} view={conflictView()} />)

    await waitFor(() =>
      expect(screen.getByTestId('merge-connector-accept-left-2')).toBeInTheDocument()
    )
    await user.click(screen.getByTestId('merge-connector-accept-left-2')) // keep both (theirs, left gap)
    await waitFor(() => expect(fakeEditors.get(oursPath)!.viewZones).toHaveLength(0))

    await user.click(screen.getByTestId('merge-connector-reject-right-2')) // reject ours → back to 1 center line

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

    await waitFor(() =>
      expect(screen.getByTestId('merge-connector-accept-left-2')).toBeInTheDocument()
    )

    // Ours is included by default already; explicitly pull theirs (left gap) in too.
    await user.click(screen.getByTestId('merge-connector-accept-left-2'))

    await waitFor(() => {
      expect(fakeEditors.get(centerPath)!.getModel().getValue()).toBe(
        'header\nours conflict\ntheirs conflict'
      )
    })
  })

  it('rejecting one side afterwards leaves the other side’s previously-accepted content intact', async () => {
    const user = userEvent.setup()
    render(<ThreeWayMergeEditor repoPath={REPO_PATH} filePath={FILE_PATH} view={conflictView()} />)

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

  it('hides a side’s buttons once decided, without touching the other side’s buttons', async () => {
    const user = userEvent.setup()
    render(<ThreeWayMergeEditor repoPath={REPO_PATH} filePath={FILE_PATH} view={conflictView()} />)

    await waitFor(() =>
      expect(screen.getByTestId('merge-connector-accept-right-2')).toBeInTheDocument()
    )
    await user.click(screen.getByTestId('merge-connector-accept-right-2')) // decide ours (idempotent accept, right gap)

    await waitFor(() => {
      expect(screen.queryByTestId('merge-connector-accept-right-2')).not.toBeInTheDocument()
      expect(screen.queryByTestId('merge-connector-reject-right-2')).not.toBeInTheDocument()
    })
    // The theirs-side buttons in the other gap are unaffected.
    expect(screen.getByTestId('merge-connector-accept-left-2')).toBeInTheDocument()
    expect(screen.getByTestId('merge-connector-reject-left-2')).toBeInTheDocument()

    // But the ribbon itself stays, now settled as dotted edges with conflict color.
    expect(screen.getByTestId('merge-connector-ribbon-right-2-top')).toHaveClass(
      'merge-connector-conflict'
    )
    expect(screen.getByTestId('merge-connector-ribbon-right-2-top')).toHaveClass('merge-resolved')
    expect(screen.getByTestId('merge-connector-ribbon-right-2-bottom')).toHaveClass(
      'merge-connector-conflict'
    )
    expect(screen.getByTestId('merge-connector-ribbon-right-2-bottom')).toHaveClass(
      'merge-resolved'
    )
  })

  it('only offers actions on the side that authored the change — the mirror pane of a one-sided block has no buttons', async () => {
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
    const view: ThreeWayMergeView = {
      filePath: FILE_PATH,
      renderable: true,
      isBinary: false,
      blocks,
      oursText: 'ours modified',
      theirsText: 'original',
      conflictCount: 0,
    }
    render(<ThreeWayMergeEditor repoPath={REPO_PATH} filePath={FILE_PATH} view={view} />)

    // Ours authored this change → buttons and ribbon in the right (ours) gap only; the theirs pane just
    // mirrors the untouched ancestor, its gap has no ribbon and no actions.
    await waitFor(() =>
      expect(screen.getByTestId('merge-connector-accept-right-1')).toBeInTheDocument()
    )
    expect(screen.queryByTestId('merge-connector-accept-left-1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('merge-connector-reject-left-1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('merge-connector-ribbon-left-1')).not.toBeInTheDocument()
  })

  it('resolves a one-sided block exclusively: accepting theirs swaps the block to theirs’ content instead of keeping both', async () => {
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
    const view: ThreeWayMergeView = {
      filePath: FILE_PATH,
      renderable: true,
      isBinary: false,
      blocks,
      oursText: 'original',
      theirsText: 'theirs modified',
      conflictCount: 0,
    }
    const user = userEvent.setup()
    render(<ThreeWayMergeEditor repoPath={REPO_PATH} filePath={FILE_PATH} view={view} />)

    await waitFor(() =>
      expect(screen.getByTestId('merge-connector-accept-left-1')).toBeInTheDocument()
    )
    await user.click(screen.getByTestId('merge-connector-accept-left-1'))

    await waitFor(() => {
      expect(fakeEditors.get(centerPath)!.getModel().getValue()).toBe('theirs modified')
    })
  })

  it('ignoring a one-sided change restores the other side (the ancestor mirror) instead of leaving the block empty', async () => {
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
    const view: ThreeWayMergeView = {
      filePath: FILE_PATH,
      renderable: true,
      isBinary: false,
      blocks,
      oursText: 'ours modified',
      theirsText: 'original',
      conflictCount: 0,
    }
    const user = userEvent.setup()
    render(<ThreeWayMergeEditor repoPath={REPO_PATH} filePath={FILE_PATH} view={view} />)

    await waitFor(() =>
      expect(screen.getByTestId('merge-connector-reject-right-1')).toBeInTheDocument()
    )
    await user.click(screen.getByTestId('merge-connector-reject-right-1'))

    await waitFor(() => {
      expect(fakeEditors.get(centerPath)!.getModel().getValue()).toBe('original')
    })
  })

  it('anchors a pure deletion’s actions on the side that still HAS the content, not the side that deleted it', async () => {
    // ours-only deletion: base had 'legacy-cache', ours removed it, theirs still has it — the
    // visible gray ribbon lives in theirs' gap (left), so the buttons must live there too,
    // not on ours' gap where there's nothing left to anchor against.
    const blocks: MergeBlock[] = [
      {
        blockId: 1,
        kind: 'ours-only',
        oursStartLine: 1,
        oursLineCount: 0,
        theirsStartLine: 1,
        theirsLineCount: 1,
        oursLines: [],
        theirsLines: ['legacy-cache'],
      },
    ]
    const view: ThreeWayMergeView = {
      filePath: FILE_PATH,
      renderable: true,
      isBinary: false,
      blocks,
      oursText: '',
      theirsText: 'legacy-cache',
      conflictCount: 0,
    }
    render(<ThreeWayMergeEditor repoPath={REPO_PATH} filePath={FILE_PATH} view={view} />)

    await waitFor(() =>
      expect(screen.getByTestId('merge-connector-accept-right-1')).toBeInTheDocument()
    )
    expect(screen.getByTestId('merge-connector-reject-right-1')).toBeInTheDocument()
    expect(screen.queryByTestId('merge-connector-accept-left-1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('merge-connector-reject-left-1')).not.toBeInTheDocument()
  })

  it('seeds the center buffer’s ACTUAL text to match the deletion default, so a later block never drifts by the deleted line count', async () => {
    // Regression test for a real bug: the placement metadata (mergeBlockLayout.ts's
    // defaultFlags) was fixed to default an ours-only deletion to theirs' kept content, but the
    // center pane's *seeded text* was still built from `view.oursText` alone — which has 0
    // lines for this block, since ours really did delete it. The metadata said "2 lines here"
    // while the real buffer had 0, so every block *after* this one rendered 2 lines too early —
    // exactly the "deprecated-auth shows up 2 lines short" symptom reported against the real
    // fixture. Two blocks here: the ours-only deletion (legacy-cache/legacy-session, kept by
    // theirs), followed by an unrelated unchanged line (deprecated-auth) — the bug only shows
    // once there's something *after* the mismatched block to visibly drift.
    const blocks: MergeBlock[] = [
      {
        blockId: 1,
        kind: 'ours-only',
        oursStartLine: 1,
        oursLineCount: 0,
        theirsStartLine: 1,
        theirsLineCount: 2,
        oursLines: [],
        theirsLines: ['legacy-cache', 'legacy-session'],
      },
      {
        blockId: 2,
        kind: 'unchanged',
        oursStartLine: 1,
        oursLineCount: 1,
        theirsStartLine: 3,
        theirsLineCount: 1,
        oursLines: ['deprecated-auth'],
        theirsLines: ['deprecated-auth'],
      },
    ]
    const view: ThreeWayMergeView = {
      filePath: FILE_PATH,
      renderable: true,
      isBinary: false,
      blocks,
      oursText: 'deprecated-auth',
      theirsText: 'legacy-cache\nlegacy-session\ndeprecated-auth',
      conflictCount: 0,
    }
    render(<ThreeWayMergeEditor repoPath={REPO_PATH} filePath={FILE_PATH} view={view} />)

    await waitFor(() => {
      expect(fakeEditors.get(centerPath)!.getModel().getValue()).toBe(
        'legacy-cache\nlegacy-session\ndeprecated-auth'
      )
    })
  })

  it('renders NO ribbon at all in the mirror gap of a pure addition — untouched code, nothing to connect', async () => {
    // ours-only addition, ours default-included in center: theirs never had this content and
    // never will — per spec its gap shows no decoration whatsoever (not even a flat stroke),
    // matching the "Aucune" row of the addition decoration matrix.
    const blocks: MergeBlock[] = [
      {
        blockId: 1,
        kind: 'ours-only',
        oursStartLine: 1,
        oursLineCount: 2,
        theirsStartLine: 1,
        theirsLineCount: 0,
        oursLines: ['addon-metrics', 'addon-tracing'],
        theirsLines: [],
      },
    ]
    const view: ThreeWayMergeView = {
      filePath: FILE_PATH,
      renderable: true,
      isBinary: false,
      blocks,
      oursText: 'addon-metrics\naddon-tracing',
      theirsText: '',
      conflictCount: 0,
    }
    render(<ThreeWayMergeEditor repoPath={REPO_PATH} filePath={FILE_PATH} view={view} />)

    // The ours (authoring) gap has the real, non-flat ribbon and the actionable buttons.
    await waitFor(() =>
      expect(screen.getByTestId('merge-connector-ribbon-right-1')).toBeInTheDocument()
    )
    expect(screen.getByTestId('merge-connector-ribbon-right-1')).not.toHaveClass(
      'merge-connector-flat'
    )
    expect(screen.getByTestId('merge-connector-accept-right-1')).toBeInTheDocument()

    // Theirs' gap has nothing — no ribbon, flat or otherwise.
    expect(screen.queryByTestId('merge-connector-ribbon-left-1')).not.toBeInTheDocument()
  })

  it('nudges a marker-anchored ribbon endpoint by the same 1px as the CSS-shifted marker line, so the tip still lands exactly on it', async () => {
    // theirs-only addition, not yet pulled into the center: theirs (the source) still gets its
    // own real ribbon (paneCount 2, not skipped), funneling down to the center's not-yet-filled
    // marker point (count 0) — that point must carry the -1px nudge (mergeDecorations.ts's
    // MARKER_NUDGE_PX, matching the `.merge-marker-top-*` CSS `translateY(-1px)`), not the raw
    // unshifted line top.
    const blocks: MergeBlock[] = [
      {
        blockId: 1,
        kind: 'theirs-only',
        oursStartLine: 1,
        oursLineCount: 0,
        theirsStartLine: 1,
        theirsLineCount: 2,
        oursLines: [],
        theirsLines: ['beta-feature-x', 'beta-feature-y'],
      },
    ]
    const view: ThreeWayMergeView = {
      filePath: FILE_PATH,
      renderable: true,
      isBinary: false,
      blocks,
      oursText: '',
      theirsText: 'beta-feature-x\nbeta-feature-y',
      conflictCount: 0,
    }
    render(<ThreeWayMergeEditor repoPath={REPO_PATH} filePath={FILE_PATH} view={view} />)

    await waitFor(() =>
      expect(screen.getByTestId('merge-connector-ribbon-left-1')).toBeInTheDocument()
    )
    const leftRibbon = screen.getByTestId('merge-connector-ribbon-left-1')
    expect(leftRibbon).not.toHaveClass('merge-connector-flat') // theirs has real content — a genuine funnel, not a flat stroke
    const d = leftRibbon.getAttribute('d')
    // The fake editor's line height is 18px (see __tests__/fakeMonacoPane.tsx): theirs' 2-line
    // block spans raw Y 0→36. The center end (not yet pulled in) is a marker point, nudged from
    // its raw 0 to -1.
    expect(d).toBe('M 0,0 C 20,0 20,-1 40,-1 L 40,0 C 20,0 20,36 0,36 Z')
  })

  it('nudges a deletion’s zero-line pane endpoint to match the deletion marker line', async () => {
    // ours-only deletion (ours deleted, theirs kept): center now defaults to theirs' content
    // (mergeBlockLayout.ts's defaultFlags exception), so theirs' own segment has no ribbon,
    // and ours' segment is a funnel from the center's real content down to ours' own 1px-nudged
    // deletion marker line.
    const blocks: MergeBlock[] = [
      {
        blockId: 1,
        kind: 'ours-only',
        oursStartLine: 1,
        oursLineCount: 0,
        theirsStartLine: 1,
        theirsLineCount: 2,
        oursLines: [],
        theirsLines: ['legacy-cache', 'legacy-session'],
      },
    ]
    const view: ThreeWayMergeView = {
      filePath: FILE_PATH,
      renderable: true,
      isBinary: false,
      blocks,
      oursText: '',
      theirsText: 'legacy-cache\nlegacy-session',
      conflictCount: 0,
    }
    render(<ThreeWayMergeEditor repoPath={REPO_PATH} filePath={FILE_PATH} view={view} />)

    // Theirs (kept content) — a plain, fully-aligned parallel ribbon (both ends span raw Y 0→36
    // in the fake editor's 18px-tall lines), no marker involved at all.
    await waitFor(() =>
      expect(screen.getByTestId('merge-connector-ribbon-right-1')).toBeInTheDocument()
    )
    const rightRibbon = screen.getByTestId('merge-connector-ribbon-right-1')
    expect(screen.queryByTestId('merge-connector-ribbon-left-1')).not.toBeInTheDocument()
    expect(rightRibbon).not.toHaveClass('merge-connector-flat')
    expect(rightRibbon).toHaveClass('merge-connector-deletion')
    expect(rightRibbon.getAttribute('d')).toBe(
      'M 0,0 C 20,0 20,-1 40,-1 L 40,0 C 20,0 20,36 0,36 Z'
    )
  })

  it('does not draw a one-sided MODIFICATION’s mirror ribbon — both sides have real content, but the passive side has no ribbon', async () => {
    const blocks: MergeBlock[] = [
      {
        blockId: 1,
        kind: 'ours-only',
        oursStartLine: 1,
        oursLineCount: 1,
        theirsStartLine: 1,
        theirsLineCount: 1,
        oursLines: ['http-client = 7.32.0'],
        theirsLines: ['http-client = 7.4.0'],
      },
    ]
    const view: ThreeWayMergeView = {
      filePath: FILE_PATH,
      renderable: true,
      isBinary: false,
      blocks,
      oursText: 'http-client = 7.32.0',
      theirsText: 'http-client = 7.4.0',
      conflictCount: 0,
    }
    render(<ThreeWayMergeEditor repoPath={REPO_PATH} filePath={FILE_PATH} view={view} />)

    await waitFor(() =>
      expect(screen.queryByTestId('merge-connector-ribbon-left-1')).not.toBeInTheDocument()
    )
  })
})

describe('ThreeWayMergeEditor — undo', () => {
  it('restores the previous placements (and re-shows the buttons) when the center edit is undone', async () => {
    const user = userEvent.setup()
    render(<ThreeWayMergeEditor repoPath={REPO_PATH} filePath={FILE_PATH} view={conflictView()} />)

    await waitFor(() =>
      expect(screen.getByTestId('merge-connector-accept-left-2')).toBeInTheDocument()
    )
    await user.click(screen.getByTestId('merge-connector-accept-left-2'))
    await waitFor(() =>
      expect(fakeEditors.get(centerPath)!.getModel().getValue()).toContain('theirs conflict')
    )
    // The buttons live in the connector overlay, whose segments are recomputed in a rAF tick —
    // their disappearance is async even though the model text above updated synchronously.
    await waitFor(() =>
      expect(screen.queryByTestId('merge-connector-accept-left-2')).not.toBeInTheDocument()
    )

    // Simulate Monaco's own undo restoring the pre-action text (a real Ctrl+Z reverts the
    // model directly; ThreeWayMergeEditor only listens for the resulting content-change event).
    fakeEditors
      .get(centerPath)!
      .getModel()
      .simulateExternalChange('header\nours conflict', { isUndoing: true })

    await waitFor(() => {
      expect(screen.getByTestId('merge-connector-accept-left-2')).toBeInTheDocument()
    })
  })

  it('restores the previous placements (and re-shows the buttons) on undo when a gutter action did not change any text (like rejecting a deletion)', async () => {
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
    const view: ThreeWayMergeView = {
      filePath: FILE_PATH,
      renderable: true,
      isBinary: false,
      blocks,
      oursText: '',
      theirsText: 'original line',
      conflictCount: 0,
    }
    render(<ThreeWayMergeEditor repoPath={REPO_PATH} filePath={FILE_PATH} view={view} />)

    // Initially, the reject button (ignore/reject ours, right gap) is present
    await waitFor(() =>
      expect(screen.getByTestId('merge-connector-reject-right-1')).toBeInTheDocument()
    )

    // Click Reject. This resolves the block but keeps the original line (which is already in the center), so text remains "original line".
    await user.click(screen.getByTestId('merge-connector-reject-right-1'))

    // The buttons disappear
    await waitFor(() =>
      expect(screen.queryByTestId('merge-connector-reject-right-1')).not.toBeInTheDocument()
    )

    // Trigger programmatical Ctrl+Z (undo) via Monaco's trigger API
    fakeEditors.get(centerPath)!.trigger('keyboard', 'undo', null)

    // The buttons should reappear
    await waitFor(() => {
      expect(screen.getByTestId('merge-connector-reject-right-1')).toBeInTheDocument()
    })
  })

  it('handles multiple consecutive gutter actions that do not change text (e.g. reject addition then reject deletion) and undos them one by one', async () => {
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
        theirsLines: ['original line 1'],
      },
      {
        blockId: 2,
        kind: 'ours-only',
        oursStartLine: 2,
        oursLineCount: 1,
        theirsStartLine: 2,
        theirsLineCount: 0,
        oursLines: ['original line 2'],
        theirsLines: [],
      },
    ]
    const view: ThreeWayMergeView = {
      filePath: FILE_PATH,
      renderable: true,
      isBinary: false,
      blocks,
      oursText: 'original line 2',
      theirsText: 'original line 1',
      conflictCount: 0,
    }
    render(<ThreeWayMergeEditor repoPath={REPO_PATH} filePath={FILE_PATH} view={view} />)

    // Block 1 is ours-only deletion (oursLines is empty, theirsLines has 'original line 1').
    // Block 2 is ours-only addition (oursLines has 'original line 2', theirsLines is empty).
    await waitFor(() => {
      expect(screen.getByTestId('merge-connector-reject-right-1')).toBeInTheDocument()
      expect(screen.getByTestId('merge-connector-reject-right-2')).toBeInTheDocument()
    })

    // 1. Reject addition (Block 2). Text doesn't change (starts empty, remains empty).
    await user.click(screen.getByTestId('merge-connector-reject-right-2'))
    await waitFor(() =>
      expect(screen.queryByTestId('merge-connector-reject-right-2')).not.toBeInTheDocument()
    )

    // 2. Reject deletion (Block 1). Text doesn't change (starts with line, keeps line).
    await user.click(screen.getByTestId('merge-connector-reject-right-1'))
    await waitFor(() =>
      expect(screen.queryByTestId('merge-connector-reject-right-1')).not.toBeInTheDocument()
    )

    // 3. Undo once (should restore Block 1 / Reject deletion)
    fakeEditors.get(centerPath)!.trigger('keyboard', 'undo', null)
    await waitFor(() => {
      expect(screen.getByTestId('merge-connector-reject-right-1')).toBeInTheDocument()
    })
    // Block 2 should still be resolved (no buttons)
    expect(screen.queryByTestId('merge-connector-reject-right-2')).not.toBeInTheDocument()

    // 4. Undo again (should restore Block 2 / Reject addition)
    fakeEditors.get(centerPath)!.trigger('keyboard', 'undo', null)
    await waitFor(() => {
      expect(screen.getByTestId('merge-connector-reject-right-2')).toBeInTheDocument()
    })
    // Block 1 buttons should also remain present
    expect(screen.getByTestId('merge-connector-reject-right-1')).toBeInTheDocument()
  })

  it('restores the previous placements and actions on undo when both sides of a conflict are rejected (Left first, then Right)', async () => {
    const user = userEvent.setup()
    render(<ThreeWayMergeEditor repoPath={REPO_PATH} filePath={FILE_PATH} view={conflictView()} />)

    // Initially, both reject buttons are present
    await waitFor(() => {
      expect(screen.getByTestId('merge-connector-reject-left-2')).toBeInTheDocument()
      expect(screen.getByTestId('merge-connector-reject-right-2')).toBeInTheDocument()
    })

    // 1. Reject theirs (left side of conflict)
    await user.click(screen.getByTestId('merge-connector-reject-left-2'))
    await waitFor(() =>
      expect(screen.queryByTestId('merge-connector-reject-left-2')).not.toBeInTheDocument()
    )

    // 2. Reject ours (right side of conflict)
    await user.click(screen.getByTestId('merge-connector-reject-right-2'))
    await waitFor(() =>
      expect(screen.queryByTestId('merge-connector-reject-right-2')).not.toBeInTheDocument()
    )

    // 3. Undo once (should restore Block 2's right/ours reject action first, text changes back to ours conflict)
    fakeEditors.get(centerPath)!.trigger('keyboard', 'undo', null)
    await waitFor(() => {
      expect(screen.getByTestId('merge-connector-reject-right-2')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('merge-connector-reject-left-2')).not.toBeInTheDocument()

    // 4. Undo again (should restore Block 2's left/theirs reject action, text remains ours conflict)
    fakeEditors.get(centerPath)!.trigger('keyboard', 'undo', null)
    await waitFor(() => {
      expect(screen.getByTestId('merge-connector-reject-left-2')).toBeInTheDocument()
      expect(screen.getByTestId('merge-connector-reject-right-2')).toBeInTheDocument()
    })
  })

  it('restores the previous placements and actions on undo when both sides of a conflict are rejected (Right first, then Left)', async () => {
    const user = userEvent.setup()
    render(<ThreeWayMergeEditor repoPath={REPO_PATH} filePath={FILE_PATH} view={conflictView()} />)

    // Initially, both reject buttons are present
    await waitFor(() => {
      expect(screen.getByTestId('merge-connector-reject-left-2')).toBeInTheDocument()
      expect(screen.getByTestId('merge-connector-reject-right-2')).toBeInTheDocument()
    })

    // 1. Reject ours (right side of conflict)
    await user.click(screen.getByTestId('merge-connector-reject-right-2'))
    await waitFor(() =>
      expect(screen.queryByTestId('merge-connector-reject-right-2')).not.toBeInTheDocument()
    )

    // 2. Reject theirs (left side of conflict)
    await user.click(screen.getByTestId('merge-connector-reject-left-2'))
    await waitFor(() =>
      expect(screen.queryByTestId('merge-connector-reject-left-2')).not.toBeInTheDocument()
    )

    // 3. Undo once (should restore Block 2's left/theirs reject action first, text changes back to theirs conflict)
    fakeEditors.get(centerPath)!.trigger('keyboard', 'undo', null)
    await waitFor(() => {
      expect(screen.getByTestId('merge-connector-reject-left-2')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('merge-connector-reject-right-2')).not.toBeInTheDocument()

    // 4. Undo again (should restore Block 2's right/ours reject action, text changes back to ours conflict)
    fakeEditors.get(centerPath)!.trigger('keyboard', 'undo', null)
    await waitFor(() => {
      expect(screen.getByTestId('merge-connector-reject-left-2')).toBeInTheDocument()
      expect(screen.getByTestId('merge-connector-reject-right-2')).toBeInTheDocument()
    })
  })
})

describe('ThreeWayMergeEditor — file switch', () => {
  it('resets placements/decorations to the new file instead of keeping the previous file’s state', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <ThreeWayMergeEditor repoPath={REPO_PATH} filePath={FILE_PATH} view={conflictView()} />
    )

    await waitFor(() =>
      expect(screen.getByTestId('merge-connector-accept-left-2')).toBeInTheDocument()
    )
    await user.click(screen.getByTestId('merge-connector-accept-left-2')) // decide something on file A
    await waitFor(() =>
      expect(fakeEditors.get(centerPath)!.getModel().getValue()).toContain('theirs conflict')
    )

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
    // The addition block (blockId 1, ours-only) is non-conflicting but stays pending
    // (deletions/additions are skipped by the auto-merge wand) — its own gutter action remains.
    // The real conflict (now blockId 3) is left fully pending for the user, actionable from both gaps.
    await waitFor(() => {
      expect(screen.getByTestId('merge-connector-accept-right-1')).toBeInTheDocument()
      expect(screen.getByTestId('merge-connector-accept-left-3')).toBeInTheDocument()
    })
  })
})

describe('ThreeWayMergeEditor — scroll preservation on undo/redo', () => {
  it('preserves scroll position of editors when undo/redo or gutter actions are triggered', async () => {
    const user = userEvent.setup()
    render(<ThreeWayMergeEditor repoPath={REPO_PATH} filePath={FILE_PATH} view={conflictView()} />)

    await waitFor(() => expect(fakeEditors.get(centerPath)).toBeDefined())

    const centerEditor = fakeEditors.get(centerPath)!
    const oursEditor = fakeEditors.get(oursPath)!
    const theirsEditor = fakeEditors.get(theirsPath)!

    // Simulate user scrolled in all three panes
    oursEditor.setScrollTop(123)
    centerEditor.setScrollTop(456)
    theirsEditor.setScrollTop(789)

    // Wait for buttons to mount
    await waitFor(() =>
      expect(screen.getByTestId('merge-connector-accept-right-2')).toBeInTheDocument()
    )

    // Click "Accept Ours" (ignore theirs - reject left)
    await user.click(screen.getByTestId('merge-connector-accept-right-2'))

    // Verify that the scroll positions are preserved after the action layout settles
    await waitFor(() => {
      expect(oursEditor.getScrollTop()).toBe(123)
      expect(centerEditor.getScrollTop()).toBe(456)
      expect(theirsEditor.getScrollTop()).toBe(789)
    })

    // Trigger programmatical Ctrl+Z (undo)
    centerEditor.trigger('keyboard', 'undo', null)

    // Verify that the scroll positions are preserved after undo
    await waitFor(() => {
      expect(oursEditor.getScrollTop()).toBe(123)
      expect(centerEditor.getScrollTop()).toBe(456)
      expect(theirsEditor.getScrollTop()).toBe(789)
    })
  })
})

describe('ThreeWayMergeEditor — panel resizing', () => {
  it('renders the resize handles and panels with correct styles, and resizes panels on drag', async () => {
    render(<ThreeWayMergeEditor repoPath={REPO_PATH} filePath={FILE_PATH} view={conflictView()} />)

    // Verify pane wrappers and handles are in the document
    const theirsWrapper = screen.getByTestId('merge-pane-theirs-wrapper')
    const centerWrapper = screen.getByTestId('merge-pane-center-wrapper')
    const oursWrapper = screen.getByTestId('merge-pane-ours-wrapper')
    const leftHandle = screen.getByTestId('merge-resize-handle-left')
    const rightHandle = screen.getByTestId('merge-resize-handle-right')

    expect(theirsWrapper).toBeInTheDocument()
    expect(centerWrapper).toBeInTheDocument()
    expect(oursWrapper).toBeInTheDocument()
    expect(leftHandle).toBeInTheDocument()
    expect(rightHandle).toBeInTheDocument()

    // Check initial styles
    expect(theirsWrapper.style.flex).toBe('33.333 1 0%')
    expect(centerWrapper.style.flex).toBe('33.334 1 0%')
    expect(oursWrapper.style.flex).toBe('33.333 1 0%')
    expect(leftHandle.style.cursor).toBe('col-resize')
    expect(rightHandle.style.cursor).toBe('col-resize')

    // Mock getBoundingClientRect on container ref
    const container = theirsWrapper.parentElement!
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      width: 1080,
      height: 600,
      top: 0,
      left: 0,
      bottom: 600,
      right: 1080,
      x: 0,
      y: 0,
      toJSON: () => {},
    })

    // Simulate drag left handle to the right by 100px
    fireEvent.mouseDown(leftHandle, { clientX: 200 })

    fireEvent.mouseMove(window, { clientX: 300 })

    // Total width for panels is 1080 - 2 * 40 = 1000px
    // dx = 100px -> dPct = 10%
    // theirsPct = 33.333 + 10 = 43.333
    // centerPct = 33.334 - 10 = 23.334

    const getFlexGrow = (el: HTMLElement) => parseFloat(el.style.flex.split(' ')[0])

    expect(getFlexGrow(theirsWrapper)).toBeCloseTo(43.333, 3)
    expect(getFlexGrow(centerWrapper)).toBeCloseTo(23.334, 3)
    expect(getFlexGrow(oursWrapper)).toBeCloseTo(33.333, 3)

    fireEvent.mouseUp(window)
  })
})
