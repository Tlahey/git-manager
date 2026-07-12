import { useEffect } from 'react'

/** Fake stand-ins for `@monaco-editor/react`'s default export (`Editor`) and `DiffEditor` —
 * real Monaco can't run in jsdom. Used to mock the whole `@monaco-editor/react` module (via a
 * dynamic `import()` inside the `vi.mock` factory, to dodge the hoisting restriction) so that
 * `lib/monacoSetup.ts`'s `lazy(() => import('@monaco-editor/react'))` wrappers resolve to these
 * instead of the real package.
 */

export interface FakeLineChange {
  modifiedStartLineNumber: number
}

export interface FakeModifiedEditor {
  getPosition: () => { lineNumber: number; column: number } | null
  setPosition: (pos: { lineNumber: number; column: number }) => void
  revealLineInCenter: (line: number) => void
  focus: () => void
  getValue: () => string
  setValue: (v: string) => void
}

export interface FakeDiffEditorInstance {
  getLineChanges: () => FakeLineChange[] | null
  getModifiedEditor: () => FakeModifiedEditor
  onDidUpdateDiff: (cb: () => void) => { dispose: () => void }
}

export interface FakeDiffEditorHandle extends FakeDiffEditorInstance {
  /** Test-only: configure what `getLineChanges()` returns. */
  setLineChanges: (changes: FakeLineChange[]) => void
  /** Test-only: set the modified editor's simulated cursor line. */
  setCurrentLine: (line: number) => void
  /** Test-only: invoke the callback registered via `onDidUpdateDiff`. */
  triggerDiffUpdate: () => void
  /** Test-only: every line passed to `revealLineInCenter`, in call order. */
  revealedLines: number[]
  /** Test-only: every position passed to `setPosition`, in call order. */
  positionCalls: { lineNumber: number; column: number }[]
  /** Test-only: number of times `focus()` was called. */
  focusCalls: number[]
}

function createFakeDiffEditor(initialModified: string): FakeDiffEditorHandle {
  let lineChanges: FakeLineChange[] = []
  let currentLine = 1
  let modifiedValue = initialModified
  let diffUpdateCb: (() => void) | null = null
  const revealedLines: number[] = []
  const positionCalls: { lineNumber: number; column: number }[] = []
  const focusCalls: number[] = []

  const modifiedEditor: FakeModifiedEditor = {
    getPosition: () => ({ lineNumber: currentLine, column: 1 }),
    setPosition: (pos) => {
      currentLine = pos.lineNumber
      positionCalls.push(pos)
    },
    revealLineInCenter: (line) => revealedLines.push(line),
    focus: () => focusCalls.push(1),
    getValue: () => modifiedValue,
    setValue: (v) => {
      modifiedValue = v
    },
  }

  return {
    getLineChanges: () => lineChanges,
    getModifiedEditor: () => modifiedEditor,
    onDidUpdateDiff: (cb) => {
      diffUpdateCb = cb
      return { dispose: () => {} }
    },
    setLineChanges: (changes) => {
      lineChanges = changes
    },
    setCurrentLine: (line) => {
      currentLine = line
    },
    triggerDiffUpdate: () => diffUpdateCb?.(),
    revealedLines,
    positionCalls,
    focusCalls,
  }
}

/** Populated by `FakeMonacoDiffEditor` as it "mounts", keyed by `modifiedModelPath` (unique per
 * file/tab), so tests can grab the handle after rendering to drive `getLineChanges()`/cursor
 * state and inspect what the component's imperative ref methods did to it. */
export const fakeDiffEditors = new Map<string, FakeDiffEditorHandle>()

export function resetFakeDiffEditors() {
  fakeDiffEditors.clear()
}

interface FakeMonacoEditorProps {
  path?: string
  value?: string
  onMount?: (editor: unknown, monacoInstance: unknown) => void
}

/** Stand-in for the single-pane `Editor` (default export), used by `MonacoDiffViewer` when
 * `activeTab === 'file'`. */
export function FakeMonacoEditor({ path, value, onMount }: FakeMonacoEditorProps) {
  useEffect(() => {
    onMount?.({ getValue: () => value, setValue: () => {} }, {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])
  return (
    <div data-testid="fake-monaco-editor" data-path={path}>
      {value}
    </div>
  )
}

interface FakeMonacoDiffEditorProps {
  original: string
  modified: string
  modifiedModelPath: string
  options?: unknown
  onMount?: (editor: FakeDiffEditorInstance, monacoInstance: unknown) => void
}

/** Test-only: the most recent `options` prop passed to `FakeMonacoDiffEditor`, keyed by
 * `modifiedModelPath`, so tests can assert on `editorOptions` derived from viewMode/etc. */
export const lastDiffEditorOptions = new Map<string, unknown>()

/** Stand-in for `DiffEditor`, used by `MonacoDiffViewer` when `activeTab === 'diff'`. */
export function FakeMonacoDiffEditor({
  original,
  modified,
  modifiedModelPath,
  options,
  onMount,
}: FakeMonacoDiffEditorProps) {
  lastDiffEditorOptions.set(modifiedModelPath, options)
  useEffect(() => {
    const instance = createFakeDiffEditor(modified)
    fakeDiffEditors.set(modifiedModelPath, instance)
    onMount?.(instance, {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modifiedModelPath])
  return (
    <div data-testid="fake-monaco-diff-editor" data-path={modifiedModelPath}>
      <div data-testid="original">{original}</div>
      <div data-testid="modified">{modified}</div>
    </div>
  )
}
