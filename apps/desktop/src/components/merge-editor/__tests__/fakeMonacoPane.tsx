import { useEffect } from 'react'

/** A line/column position, as Monaco expresses it (1-based both ways). */
interface FakePosition {
  lineNumber: number
  column: number
}

interface FakeRange {
  startLineNumber: number
  startColumn: number
  endLineNumber: number
  endColumn: number
}

interface FakeEdit {
  range: FakeRange
  text: string
}

type ContentChangeListener = (e: { isUndoing: boolean; isRedoing: boolean }) => void

/** A minimal, line/offset-accurate stand-in for `editor.ITextModel` — just enough of Monaco's
 * model API for `mergeBlockLayout.ts`'s consumers (ThreeWayMergeEditor.tsx) to exercise real
 * edit-range math against, without needing a real Monaco instance (which can't run in jsdom). */
export function createFakeModel(initialValue: string) {
  let text = initialValue
  const listeners: ContentChangeListener[] = []

  const currentLines = () => text.split('\n')

  function positionToOffset(line: number, column: number): number {
    const lines = currentLines()
    let offset = 0
    for (let i = 0; i < line - 1; i++) offset += lines[i].length + 1 // +1 for the '\n'
    return offset + (column - 1)
  }

  function fire(event: { isUndoing?: boolean; isRedoing?: boolean } = {}) {
    const e = { isUndoing: false, isRedoing: false, ...event }
    for (const listener of listeners) listener(e)
  }

  return {
    getValue: () => text,
    getLineCount: () => currentLines().length,
    getLineContent: (n: number) => currentLines()[n - 1] ?? '',
    getLineMaxColumn: (n: number) => (currentLines()[n - 1]?.length ?? 0) + 1,
    getFullModelRange: (): FakeRange => {
      const lines = currentLines()
      return { startLineNumber: 1, startColumn: 1, endLineNumber: lines.length, endColumn: (lines[lines.length - 1]?.length ?? 0) + 1 }
    },
    /** Mirrors `editor.executeEdits` — applies one or more range replacements against the
     * current text, offset-based so it's exact regardless of how many lines an edit spans. */
    applyEdits: (edits: FakeEdit[]) => {
      const withOffsets = edits
        .map((e) => ({
          start: positionToOffset(e.range.startLineNumber, e.range.startColumn),
          end: positionToOffset(e.range.endLineNumber, e.range.endColumn),
          text: e.text,
        }))
        .sort((a, b) => b.start - a.start) // reverse order: later edits don't invalidate earlier offsets
      for (const e of withOffsets) {
        text = text.slice(0, e.start) + e.text + text.slice(e.end)
      }
      fire()
    },
    /** Test-only escape hatch for simulating a change Monaco itself would have made outside of
     * our own `executeEdits` calls — manual typing, or an undo/redo restoring prior text. */
    simulateExternalChange: (newText: string, event: { isUndoing?: boolean; isRedoing?: boolean } = {}) => {
      text = newText
      fire(event)
    },
    onDidChangeContent: (cb: ContentChangeListener) => {
      listeners.push(cb)
      return { dispose: () => {} }
    },
  }
}

export type FakeModel = ReturnType<typeof createFakeModel>

export interface FakeViewZone {
  id: string
  afterLineNumber: number
  heightInLines: number
  domNode: HTMLElement
}

export interface FakeEditorInstance {
  path: string
  getModel: () => FakeModel
  createDecorationsCollection: (initial: unknown[]) => { set: (d: unknown[]) => void }
  onDidScrollChange: (cb: () => void) => { dispose: () => void }
  onDidLayoutChange: (cb: () => void) => { dispose: () => void }
  onDidChangeModelContent: (cb: ContentChangeListener) => { dispose: () => void }
  executeEdits: (source: string, edits: FakeEdit[]) => void
  changeViewZones: (
    cb: (accessor: {
      addZone: (zone: { afterLineNumber: number; heightInLines: number; domNode: HTMLElement }) => string
      removeZone: (id: string) => void
    }) => void
  ) => void
  getScrollTop: () => number
  getTopForLineNumber: (line: number) => number
  /** Test-only: the most recent array passed to the decorations collection's `.set()`. */
  decorations: unknown[]
  /** Test-only: the currently-live view zones (adds minus removes across `changeViewZones` calls). */
  viewZones: FakeViewZone[]
}

const LINE_HEIGHT = 18

function createFakeEditor(path: string, initialValue: string): FakeEditorInstance {
  const model = createFakeModel(initialValue)
  let zoneCounter = 0
  const instance: FakeEditorInstance = {
    path,
    getModel: () => model,
    createDecorationsCollection: (initial) => {
      instance.decorations = initial
      return { set: (d: unknown[]) => { instance.decorations = d } }
    },
    onDidScrollChange: () => ({ dispose: () => {} }),
    onDidLayoutChange: () => ({ dispose: () => {} }),
    onDidChangeModelContent: (cb) => model.onDidChangeContent(cb),
    executeEdits: (_source, edits) => model.applyEdits(edits),
    changeViewZones: (cb) => {
      cb({
        addZone: (zone) => {
          const id = `zone-${++zoneCounter}`
          instance.viewZones.push({ id, ...zone })
          return id
        },
        removeZone: (id) => {
          instance.viewZones = instance.viewZones.filter((z) => z.id !== id)
        },
      })
    },
    getScrollTop: () => 0,
    getTopForLineNumber: (line: number) => (line - 1) * LINE_HEIGHT,
    decorations: [],
    viewZones: [],
  }
  return instance
}

/** Populated by `FakeMonacoEditor` as each pane "mounts", keyed by the `path` prop — which is
 * exactly `modelPath` from ThreeWayMergeEditor.tsx (`${repoPath}/${filePath}#ours` etc.), so
 * tests can look up e.g. `fakeEditors.get(\`${repoPath}/${filePath}#center\`)` after rendering. */
export const fakeEditors = new Map<string, FakeEditorInstance>()

export function resetFakeEditors() {
  fakeEditors.clear()
}

interface FakeMonacoEditorProps {
  path: string
  value: string
  onMount?: (editor: FakeEditorInstance, monaco: unknown) => void
  onChange?: (value: string | undefined) => void
}

/** Stand-in for `@monaco-editor/react`'s `Editor` (as re-exported, lazy-wrapped, by
 * `lib/monacoSetup.ts`'s `MonacoEditor`) — synchronous, no Suspense/dynamic-import involved, so
 * tests don't need to await a lazy chunk load. Mounts a fresh fake editor+model for each
 * distinct `path` and hands it to the real `onMount` callback, so switching files (a new
 * `modelPath`, same component tree position — see ThreeWayMergeEditor.tsx's `modelPath` prop)
 * is observable in tests via `fakeEditors.get(newPath)` after a rerender. */
export function FakeMonacoEditor({ path, value, onMount }: FakeMonacoEditorProps) {
  useEffect(() => {
    const instance = createFakeEditor(path, value)
    fakeEditors.set(path, instance)
    onMount?.(instance, {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])
  return null
}

export type { FakePosition }
