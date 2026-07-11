import { useEffect } from 'react'
import type { CodePaneEditorComponent } from '../CodePane'

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
 * model API for ConflictResolver.tsx's own edit-range math (buildRangeEdit/checkTextChanges) to
 * exercise real edit-range math against, without needing a real Monaco instance (which can't run
 * in jsdom). Modeled on the desktop app's own
 * `apps/desktop/src/components/merge-editor/__tests__/fakeMonacoPane.tsx`. */
export function createFakeModel(initialValue: string) {
  let text = initialValue
  const listeners: ContentChangeListener[] = []

  let nextAltId = 1
  let currentAltId = 1
  const versionHistory = new Map<string, number>()
  versionHistory.set(text, currentAltId)

  const undoStack: { text: string; altId: number }[] = []
  const redoStack: { text: string; altId: number }[] = []

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

  function updateAltId() {
    if (versionHistory.has(text)) {
      currentAltId = versionHistory.get(text)!
    } else {
      nextAltId++
      currentAltId = nextAltId
      versionHistory.set(text, currentAltId)
    }
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
    getAlternativeVersionId: () => currentAltId,
    undoStack,
    redoStack,
    undo: () => {
      if (undoStack.length === 0) return
      const entry = undoStack.pop()!
      const prevText = text
      const prevAltId = currentAltId
      text = entry.text
      currentAltId = entry.altId
      redoStack.push({ text: prevText, altId: prevAltId })
      fire({ isUndoing: true })
    },
    redo: () => {
      if (redoStack.length === 0) return
      const entry = redoStack.pop()!
      const prevText = text
      const prevAltId = currentAltId
      text = entry.text
      currentAltId = entry.altId
      undoStack.push({ text: prevText, altId: prevAltId })
      fire({ isRedoing: true })
    },
    /** Mirrors `editor.executeEdits` — applies one or more range replacements against the
     * current text, offset-based so it's exact regardless of how many lines an edit spans. */
    applyEdits: (edits: FakeEdit[]) => {
      const prevText = text
      const prevAltId = currentAltId

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
      updateAltId()
      undoStack.push({ text: prevText, altId: prevAltId })
      redoStack.length = 0
      fire()
    },
    pushStackElement: () => {},
    /** Test-only escape hatch for simulating a change Monaco itself would have made outside of
     * our own `executeEdits` calls — manual typing, or an undo/redo restoring prior text. */
    simulateExternalChange: (newText: string, event: { isUndoing?: boolean; isRedoing?: boolean } = {}) => {
      const prevText = text
      const prevAltId = currentAltId

      text = newText
      updateAltId()

      if (event.isUndoing) {
        redoStack.push({ text: prevText, altId: prevAltId })
      } else if (event.isRedoing) {
        undoStack.push({ text: prevText, altId: prevAltId })
      } else {
        undoStack.push({ text: prevText, altId: prevAltId })
        redoStack.length = 0
      }

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
  setScrollTop: (val: number) => void
  getTopForLineNumber: (line: number) => number
  addCommand: (keybinding: number, handler: () => void) => void
  focus: () => void
  trigger: (source: string, actionId: string, payload: unknown) => void
  layout: () => void
  getOption: (id: number) => number
  updateOptions: (opts: Record<string, unknown>) => void
  revealLineInCenter: (line: number) => void
  setPosition: (pos: FakePosition) => void
  setHiddenAreas: (ranges: FakeRange[]) => void
  /** Test-only: the most recent array passed to the decorations collection's `.set()`. */
  decorations: unknown[]
  /** Test-only: the currently-live view zones (adds minus removes across `changeViewZones` calls). */
  viewZones: FakeViewZone[]
  /** Test-only: map of registered commands for testing undo/redo key bindings. */
  commands: Map<number, () => void>
  /** Test-only: the most recent ranges passed to `setHiddenAreas` (collapse-unchanged). */
  hiddenAreas: FakeRange[]
  /** Test-only: the last line passed to `revealLineInCenter` (goToNextChange/goToPreviousChange). */
  lastRevealedLine: number | null
  /** Test-only: the last position passed to `setPosition`. */
  lastPosition: FakePosition | null
  /** Test-only: the most recent options object passed to `updateOptions`. */
  lastUpdateOptions: Record<string, unknown> | null
}

const LINE_HEIGHT = 18
// Arbitrary stand-in id for monaco's real `EditorOption.lineHeight` enum member — only needs to
// round-trip through `getOption` consistently with the `editor.EditorOption.lineHeight` handed
// out below, since ConflictResolver.tsx uses it as an opaque key.
const EDITOR_OPTION_LINE_HEIGHT = 66

function createFakeEditor(path: string, initialValue: string): FakeEditorInstance {
  const model = createFakeModel(initialValue)
  let zoneCounter = 0
  let scrollTop = 0
  const commands = new Map<number, () => void>()

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
    getScrollTop: () => scrollTop,
    setScrollTop: (val: number) => { scrollTop = val },
    getTopForLineNumber: (line: number) => (line - 1) * LINE_HEIGHT,
    addCommand: (keybinding, handler) => {
      commands.set(keybinding, handler)
    },
    layout: () => {},
    getOption: (id: number) => (id === EDITOR_OPTION_LINE_HEIGHT ? LINE_HEIGHT : 0),
    updateOptions: (opts) => { instance.lastUpdateOptions = opts },
    revealLineInCenter: (line) => { instance.lastRevealedLine = line },
    setPosition: (pos) => { instance.lastPosition = pos },
    setHiddenAreas: (ranges) => { instance.hiddenAreas = ranges },
    focus: () => {},
    trigger: (_source, actionId, _payload) => {
      // In fake environment, triggering undo or redo checks the registered command keybindings
      if (actionId === 'undo') {
        if (model.undoStack.length > 0) {
          model.undo()
        } else {
          const handler = commands.get(2048 | 56) // KeyMod.CtrlCmd | KeyCode.KeyZ
          if (handler) handler()
        }
      } else if (actionId === 'redo') {
        if (model.redoStack.length > 0) {
          model.redo()
        } else {
          const handlerY = commands.get(2048 | 55) // KeyMod.CtrlCmd | KeyCode.KeyY
          const handlerShiftZ = commands.get(2048 | 1024 | 56) // KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyZ
          if (handlerY) handlerY()
          else if (handlerShiftZ) handlerShiftZ()
        }
      }
    },
    decorations: [],
    viewZones: [],
    commands,
    hiddenAreas: [],
    lastRevealedLine: null,
    lastPosition: null,
    lastUpdateOptions: null,
  }
  return instance
}

/** Populated by `FakeMonacoEditor` as each pane "mounts", keyed by the `path` prop — which is
 * exactly `modelPath` from ConflictResolver.tsx (`${modelPathPrefix}#ours` etc. in 3-panel mode,
 * `${modelPathPrefix}.original`/`.modified` in 2-panel mode), so tests can look up e.g.
 * `fakeEditors.get(\`${modelPathPrefix}#center\`)` after rendering. */
export const fakeEditors = new Map<string, FakeEditorInstance>()

/** One entry per `ILineChange` Monaco's diff engine would report between two models — the
 * subset `buildDynamicMergeView` (ConflictResolver.tsx) actually reads. */
export interface FakeLineChange {
  originalStartLineNumber: number
  originalEndLineNumber: number
  modifiedStartLineNumber: number
  modifiedEndLineNumber: number
}

export interface FakeDiffEditorInstance {
  disposed: boolean
  setModel: (m: { original: { getValue: () => string }; modified: { getValue: () => string } }) => void
  onDidUpdateDiff: (cb: () => void) => { dispose: () => void }
  getLineChanges: () => FakeLineChange[] | null
  dispose: () => void
}

/** Every fake diff editor `createDiffEditor` has produced, in creation order — 2-panel mode
 * (whitespace-mode toggling in particular) tears down and recreates the diff editor, so tests
 * that care can inspect e.g. `fakeDiffEditors.at(-1)!.disposed` after switching modes. */
export const fakeDiffEditors: FakeDiffEditorInstance[] = []

export function resetFakeEditors() {
  fakeEditors.clear()
  fakeDiffEditors.length = 0
}

/** A deliberately simple stand-in for Monaco's real line-diff algorithm: trims the common
 * prefix/suffix of lines and reports whatever's left in the middle as a single changed hunk
 * (Monaco's own `originalEndLineNumber`/`modifiedEndLineNumber === 0` convention for pure
 * insertions/deletions). Exact for the single-hunk fixtures these tests use; not a general diff
 * algorithm (won't split multiple, non-adjacent hunks) — real Monaco diffing can't run in jsdom,
 * and re-implementing it fully isn't necessary to exercise ConflictResolver.tsx's own
 * `buildDynamicMergeView` translation logic. */
export function computeSimpleLineDiff(original: string, modified: string, ignoreTrimWhitespace: boolean): FakeLineChange[] {
  const origLines = original.split('\n')
  const modLines = modified.split('\n')
  const norm = (l: string) => (ignoreTrimWhitespace ? l.trim() : l)

  let prefix = 0
  while (prefix < origLines.length && prefix < modLines.length && norm(origLines[prefix]) === norm(modLines[prefix])) {
    prefix++
  }

  let suffix = 0
  while (
    suffix < origLines.length - prefix &&
    suffix < modLines.length - prefix &&
    norm(origLines[origLines.length - 1 - suffix]) === norm(modLines[modLines.length - 1 - suffix])
  ) {
    suffix++
  }

  const origChangedCount = origLines.length - prefix - suffix
  const modChangedCount = modLines.length - prefix - suffix
  if (origChangedCount === 0 && modChangedCount === 0) return []

  return [
    {
      originalStartLineNumber: origChangedCount === 0 ? prefix : prefix + 1,
      originalEndLineNumber: origChangedCount === 0 ? 0 : prefix + origChangedCount,
      modifiedStartLineNumber: modChangedCount === 0 ? prefix : prefix + 1,
      modifiedEndLineNumber: modChangedCount === 0 ? 0 : prefix + modChangedCount,
    },
  ]
}

function createFakeDiffEditor(options: { ignoreTrimWhitespace?: boolean }): FakeDiffEditorInstance {
  let originalText = ''
  let modifiedText = ''
  let listener: (() => void) | null = null
  let changes: FakeLineChange[] = []

  const instance: FakeDiffEditorInstance = {
    disposed: false,
    setModel: ({ original, modified }) => {
      originalText = original.getValue()
      modifiedText = modified.getValue()
      // Real Monaco computes the diff asynchronously — a microtask is enough for tests (via
      // `waitFor`) while still landing after the synchronous `onDidUpdateDiff` subscription that
      // immediately follows `setModel` in ConflictResolver.tsx's own effect body.
      queueMicrotask(() => {
        if (instance.disposed) return
        changes = computeSimpleLineDiff(originalText, modifiedText, options.ignoreTrimWhitespace ?? false)
        listener?.()
      })
    },
    onDidUpdateDiff: (cb) => {
      listener = cb
      return { dispose: () => { listener = null } }
    },
    getLineChanges: () => changes,
    dispose: () => {
      instance.disposed = true
      listener = null
    },
  }
  fakeDiffEditors.push(instance)
  return instance
}

/** Shared across every pane mount, same as real Monaco's singleton `monaco` namespace object —
 * `ConflictResolver.tsx` stores whichever instance the most recent pane handed it in `monacoRef`/
 * `monaco` state, so every pane needs to hand back a structurally-identical (here: literally the
 * same) object. */
/** `collapseUnchanged`'s hidden-areas effect does `new monacoInstance.Range(...)` — needs a real
 * constructor, not just a plain factory function. */
class FakeMonacoRange {
  constructor(
    public startLineNumber: number,
    public startColumn: number,
    public endLineNumber: number,
    public endColumn: number
  ) {}
}

const fakeMonacoInstance = {
  KeyMod: { CtrlCmd: 2048, Shift: 1024 },
  KeyCode: { KeyZ: 56, KeyY: 55 },
  Range: FakeMonacoRange,
  editor: {
    EditorOption: { lineHeight: EDITOR_OPTION_LINE_HEIGHT },
    createModel: (value: string) => ({ getValue: () => value, dispose: () => {} }),
    createDiffEditor: (_container: HTMLElement, diffOptions: { ignoreTrimWhitespace?: boolean } = {}) =>
      createFakeDiffEditor(diffOptions),
  },
  Uri: { parse: (value: string) => ({ toString: () => value }) },
}

export type FakeMonacoInstance = typeof fakeMonacoInstance

interface FakeMonacoEditorProps {
  path: string
  value: string
  onMount?: (editor: FakeEditorInstance, monaco: FakeMonacoInstance) => void
  onChange?: (value: string | undefined) => void
}

/** Stand-in for `@monaco-editor/react`'s `Editor`, injected directly via
 * `ConflictResolverProps.editor.component` (no module mock needed here — unlike the desktop
 * app's `lib/monacoSetup` wrapper, `CodePane.tsx` takes the editor component as a plain prop).
 * Synchronous, no Suspense/dynamic-import involved. Mounts a fresh fake editor+model for each
 * distinct `path` and hands it to the real `onMount` callback, so switching files (a new
 * `modelPathPrefix`, same component tree position) is observable in tests via
 * `fakeEditors.get(newPath)` after a rerender. */
function FakeMonacoEditorInner({ path, value, onMount }: FakeMonacoEditorProps) {
  useEffect(() => {
    const instance = createFakeEditor(path, value)
    fakeEditors.set(path, instance)
    onMount?.(instance, fakeMonacoInstance)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])
  return null
}

/** Cast to the real editor-component contract — mirrors `CodePane.tsx`'s own
 * `DefaultMonacoEditor` cast (`as unknown as CodePaneEditorComponent`); a fake can't practically
 * implement the full `IStandaloneCodeEditor`/`Monaco` surface, so this is the codebase's existing
 * escape hatch for injecting a structurally-compatible-at-runtime stand-in. */
export const FakeMonacoEditor = FakeMonacoEditorInner as unknown as CodePaneEditorComponent

export type { FakePosition, FakeRange, FakeEdit }
