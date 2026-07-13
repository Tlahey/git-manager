import { Suspense, lazy, type ComponentType, type ReactNode } from 'react'
import type { Monaco } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'

/** The subset of `@monaco-editor/react`'s Editor props the pane relies on — hosts can inject
 * their own (pre-configured, shared-lazy) editor component as long as it honors these. */
export interface CodePaneEditorProps {
  height: string
  language?: string
  theme?: string
  path?: string
  value: string
  onMount?: (editorInstance: editor.IStandaloneCodeEditor, monacoInstance: Monaco) => void
  onChange?: (value: string | undefined) => void
  options?: editor.IStandaloneEditorConstructionOptions
}

export type CodePaneEditorComponent = ComponentType<CodePaneEditorProps>

// Default editor: lazy-loaded so hosts that inject their own component never pull the chunk in.
const DefaultMonacoEditor = lazy(
  () => import('@monaco-editor/react')
) as unknown as CodePaneEditorComponent

interface CodePaneProps {
  value: string
  /** Monaco language id (e.g. 'typescript'); defaults to plaintext when omitted. */
  language?: string
  /** Monaco theme name; the host is responsible for registering custom themes (via
   * `onMount`/its injected editor component) before referencing one here. */
  theme?: string
  /** Unique per-pane model URI (e.g. `${filePath}#ours`) — without this, `@monaco-editor/react`
   * resolves every instance that omits `path` to the same empty-string model URI and silently
   * reuses one shared model across all panes instead of creating independent ones. */
  modelPath: string
  readOnly: boolean
  onMount: (editorInstance: editor.IStandaloneCodeEditor, monacoInstance: Monaco) => void
  onChange?: (value: string) => void
  /** Host-supplied replacement for the default `@monaco-editor/react` Editor. */
  editorComponent?: CodePaneEditorComponent
  loadingFallback?: ReactNode
  /** Host overrides merged underneath this pane's own required options (below) — a host can add
   * e.g. `stickyScroll`, but can't override `readOnly`/`glyphMargin`/etc. through this. */
  options?: editor.IStandaloneEditorConstructionOptions
}

/** One of the resolver's independent (non-diff) Monaco instances — each pane renders its own
 * `CodePane`. Minimap is disabled: side-by-side minimaps would be cramped, and JetBrains' own
 * 3-way merge dialog doesn't show them either. */
export function CodePane({
  value,
  language,
  theme,
  modelPath,
  readOnly,
  onMount,
  onChange,
  editorComponent,
  loadingFallback,
  options,
}: CodePaneProps) {
  const EditorComponent = editorComponent ?? DefaultMonacoEditor

  return (
    <Suspense
      fallback={
        loadingFallback ?? (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            Loading…
          </div>
        )
      }
    >
      <EditorComponent
        height="100%"
        language={language}
        theme={theme}
        path={modelPath}
        value={value}
        onMount={onMount}
        onChange={onChange ? (v) => onChange(v ?? '') : undefined}
        options={{
          ...options,
          readOnly,
          // Accept/ignore actions live in the connector gap between panes (see
          // MergeConnectorOverlay), not in Monaco's own gutter, so no glyph margin or extra
          // line-decorations space is reserved here.
          glyphMargin: false,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          renderLineHighlight: readOnly ? 'none' : 'all',
        }}
      />
    </Suspense>
  )
}
