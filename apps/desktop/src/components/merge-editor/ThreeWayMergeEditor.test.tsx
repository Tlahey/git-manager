import { createRef } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MergeBlock, ThreeWayMergeView } from '@git-manager/git-types'
import { ThreeWayMergeEditor, type ThreeWayMergeEditorRef } from './ThreeWayMergeEditor'
import { fakeEditors, resetFakeEditors, FakeMonacoEditor } from './__tests__/fakeMonacoPane'

vi.mock('../../lib/monacoSetup', () => ({
  MonacoEditor: FakeMonacoEditor,
  languageForFilePath: () => 'plaintext',
}))
vi.mock('../../lib/monacoThemes', () => ({
  registerAndApplyDynamicTheme: () => {},
}))
vi.mock('../../stores/settings.store', () => ({
  useSettingsStore: (selector: (s: { settings: { appearance: { theme: string } } }) => unknown) =>
    selector({ settings: { appearance: { theme: 'dark' } } }),
}))

const apiAutoMergeConflictView = vi.fn<(repoPath: string, filePath: string) => Promise<string>>()
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

function decorationClasses(path: string): string[] {
  const decorations = fakeEditors.get(path)?.decorations as Array<{ options: { className?: string } }> | undefined
  return (decorations ?? []).map((d) => d.options.className).filter((c): c is string => Boolean(c))
}

beforeEach(() => {
  resetFakeEditors()
  apiAutoMergeConflictView.mockReset()
})

describe('ThreeWayMergeEditor — decorations', () => {
  it('colors the conflicting block red (a genuine two-sided conflict) on both sides and in the center, and never colors the unchanged header', async () => {
    render(<ThreeWayMergeEditor repoPath={REPO_PATH} filePath={FILE_PATH} view={conflictView()} />)

    await waitFor(() => {
      expect(decorationClasses(oursPath)).toContain('merge-text-conflict')
      expect(decorationClasses(theirsPath)).toContain('merge-text-conflict')
      expect(decorationClasses(centerPath)).toContain('merge-text-conflict')
    })

    // Only one decoration per pane: the header (block 1, unchanged) never gets a color class.
    expect(decorationClasses(oursPath)).toHaveLength(1)
    expect(decorationClasses(theirsPath)).toHaveLength(1)
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
    expect(screen.queryByTestId('merge-connector-accept-right-2')).not.toBeInTheDocument()

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
