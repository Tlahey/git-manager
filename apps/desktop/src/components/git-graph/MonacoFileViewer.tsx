import type * as monaco from 'monaco-editor'
import type { editor } from 'monaco-editor'
import { CodeEditor } from '@git-manager/editor'
import { useSettingsStore } from '../../stores/settings.store'

interface MonacoFileViewerProps {
  content: string
  filePath: string
  /** Called after the editor mounts (theme is already applied) — e.g. to attach blame decorations. */
  onMount?: (editorInstance: editor.IStandaloneCodeEditor, monacoInstance: typeof monaco) => void
  /** Overrides merged over the default read-only viewer options. */
  optionsOverride?: editor.IStandaloneEditorConstructionOptions
}

/**
 * App-side binding of `@git-manager/editor`'s presentational `CodeEditor`: reads the current
 * theme and sticky-scroll flag from the settings store and forwards them as props. All the
 * Monaco wiring itself lives in the library component. `BlameFileViewer` reuses this (via
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

  return (
    <CodeEditor
      content={content}
      filePath={filePath}
      theme={theme}
      stickyScroll={stickyScroll}
      onMount={onMount}
      optionsOverride={optionsOverride}
    />
  )
}
