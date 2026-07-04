import { Suspense, useEffect, useRef } from 'react'
import type { Monaco } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { useSettingsStore } from '../../stores/settings.store'
import { registerAndApplyDynamicTheme } from '../../lib/monacoThemes'
import { MonacoEditor, languageForFilePath } from '../../lib/monacoSetup'

interface MergePaneProps {
  value: string
  filePath: string
  /** Unique per-pane model URI (e.g. `${filePath}.ours`) — without this, `@monaco-editor/react`
   * resolves every instance that omits `path` to the same empty-string model URI and silently
   * reuses one shared model across all three panes instead of creating independent ones. */
  modelPath: string
  readOnly: boolean
  onMount: (editorInstance: editor.IStandaloneCodeEditor, monacoInstance: Monaco) => void
  onChange?: (value: string) => void
}

/** One of the merge editor's three independent (non-diff) Monaco instances — ours/center/
 * theirs each render their own `MergePane`. Minimap is disabled here unlike the 2-pane
 * `MonacoDiffViewer`: three side-by-side minimaps would be cramped, and JetBrains' own
 * 3-way merge dialog doesn't show them either. */
export function MergePane({ value, filePath, modelPath, readOnly, onMount, onChange }: MergePaneProps) {
  const theme = useSettingsStore((s) => s.settings.appearance.theme)
  const monacoRef = useRef<Monaco | null>(null)
  const language = languageForFilePath(filePath)

  useEffect(() => {
    if (monacoRef.current) {
      registerAndApplyDynamicTheme(monacoRef.current)
    }
  }, [theme])

  return (
    <Suspense
      fallback={
        <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
          Loading…
        </div>
      }
    >
      <MonacoEditor
        height="100%"
        language={language}
        theme="git-manager-dynamic"
        path={modelPath}
        value={value}
        onMount={(editorInstance, monacoInstance) => {
          monacoRef.current = monacoInstance
          registerAndApplyDynamicTheme(monacoInstance)
          onMount(editorInstance, monacoInstance)
        }}
        onChange={onChange ? (v) => onChange(v ?? '') : undefined}
        options={{
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
