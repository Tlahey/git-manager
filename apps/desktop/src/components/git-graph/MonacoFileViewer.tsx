import { Suspense, useEffect, useMemo, useRef } from 'react'
import type * as monaco from 'monaco-editor'
import type { editor } from 'monaco-editor'
import { useSettingsStore } from '../../stores/settings.store'
import { registerAndApplyDynamicTheme } from '../../lib/monacoThemes'
import { MonacoEditor, languageForFilePath } from '../../lib/monacoSetup'

interface MonacoFileViewerProps {
  content: string
  filePath: string
  /** Called after the editor mounts (theme is already applied) — e.g. to attach blame decorations. */
  onMount?: (editorInstance: editor.IStandaloneCodeEditor, monacoInstance: typeof monaco) => void
  /** Overrides merged over the default read-only viewer options. */
  optionsOverride?: editor.IStandaloneEditorConstructionOptions
}

/**
 * Read-only single-pane Monaco viewer for the "File" tab (full file contents, no diff) —
 * extracted from the old `MonacoDiffViewer`. Deliberately stays on plain Monaco rather than
 * `@git-manager/code-view`'s block-based `CodePane`: there's no diff to compute here, and
 * Monaco alone is the better fit for straight file reading. `BlameFileViewer` reuses it (via
 * `onMount`/`optionsOverride`) to layer the blame gutter on top.
 */
export function MonacoFileViewer({
  content,
  filePath,
  onMount,
  optionsOverride,
}: MonacoFileViewerProps) {
  const theme = useSettingsStore((s) => s.settings.appearance.theme)
  const stickyScroll = useSettingsStore((s) => s.settings.appearance.stickyScroll ?? false)
  const monacoRef = useRef<typeof monaco | null>(null)

  // Re-apply theme when theme changes
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
