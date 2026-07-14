import { Suspense, useEffect, useMemo, useRef } from 'react'
import type * as monaco from 'monaco-editor'
import type { editor } from 'monaco-editor'
import { registerAndApplyDynamicTheme } from './monaco/themes'
import { MonacoEditor, languageForFilePath } from './monaco/setup'

export interface CodeEditorProps {
  content: string
  filePath: string
  /** App theme id — used only as an effect dependency to re-apply the dynamic Monaco theme
   * when the host theme changes. The editor itself references 'git-manager-dynamic' by name. */
  theme?: string
  /** Enable Monaco's sticky-scroll header. */
  stickyScroll?: boolean
  /** Called after the editor mounts (theme is already applied) — e.g. to attach blame decorations. */
  onMount?: (editorInstance: editor.IStandaloneCodeEditor, monacoInstance: typeof monaco) => void
  /** Overrides merged over the default read-only viewer options. */
  optionsOverride?: editor.IStandaloneEditorConstructionOptions
}

/**
 * Read-only single-pane Monaco viewer (full file contents, no diff). Presentational — the host
 * passes the current theme id and sticky-scroll flag as props (no store dependency), which keeps
 * it mountable in isolation. The app's `MonacoFileViewer` is a thin binding that reads those from
 * the settings store; `BlameFileViewer` reuses it (via `onMount`/`optionsOverride`) to layer the
 * blame gutter on top. Deliberately stays on plain Monaco rather than the block-based `CodePane`:
 * there's no diff to compute here, and Monaco alone is the better fit for straight file reading.
 */
export function CodeEditor({
  content,
  filePath,
  theme,
  stickyScroll = false,
  onMount,
  optionsOverride,
}: CodeEditorProps) {
  const monacoRef = useRef<typeof monaco | null>(null)

  // Re-apply theme when the host theme changes
  useEffect(() => {
    if (monacoRef.current) {
      registerAndApplyDynamicTheme(monacoRef.current)
    }
  }, [theme])

  const language = useMemo(() => languageForFilePath(filePath), [filePath])

  return (
    <Suspense
      fallback={
        <div className="flex h-full w-full items-center justify-center">
          <span className="text-muted-foreground">Loading Monaco Editor...</span>
        </div>
      }
    >
      <MonacoEditor
        height="100%"
        language={language}
        theme="git-manager-dynamic"
        onMount={(editorInstance, monacoInstance) => {
          monacoRef.current = monacoInstance
          registerAndApplyDynamicTheme(monacoInstance)
          onMount?.(editorInstance, monacoInstance)
        }}
        value={content}
        path={filePath}
        options={{
          readOnly: true,
          minimap: { enabled: true },
          scrollBeyondLastLine: false,
          glyphMargin: true,
          stickyScroll: { enabled: stickyScroll },
          ...optionsOverride,
        }}
      />
    </Suspense>
  )
}
