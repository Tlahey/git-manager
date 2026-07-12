import { Suspense, useMemo, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import type * as monaco from 'monaco-editor'
import { useSettingsStore } from '../../stores/settings.store'
import { registerAndApplyDynamicTheme } from '../../lib/monacoThemes'
import { MonacoEditor, MonacoDiffEditor, languageForFilePath } from '../../lib/monacoSetup'

interface MonacoDiffViewerProps {
  original: string
  modified: string
  filePath: string
  viewMode: 'inline' | 'split'
  activeTab: 'diff' | 'file'
  ignoreWhitespace: boolean
  /** Fired with the number of line-change groups whenever the diff is (re)computed. */
  onChangeCount?: (count: number) => void
  /** Collapses unchanged regions so only changed fragments (plus context) are shown. */
  collapseUnchanged?: boolean
}

export interface MonacoDiffViewerRef {
  goToNextChange: () => void
  goToPreviousChange: () => void
  getModifiedValue: () => string
  setModifiedValue: (value: string) => void
}

export const MonacoDiffViewer = forwardRef<MonacoDiffViewerRef, MonacoDiffViewerProps>(
  (
    {
      original,
      modified,
      filePath,
      viewMode,
      activeTab,
      ignoreWhitespace,
      onChangeCount,
      collapseUnchanged,
    },
    ref
  ) => {
    const theme = useSettingsStore((s) => s.settings.appearance.theme)
    const monacoRef = useRef<typeof monaco | null>(null)
    const diffEditorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null)

    // Re-apply theme when theme changes
    useEffect(() => {
      if (monacoRef.current) {
        registerAndApplyDynamicTheme(monacoRef.current)
      }
    }, [theme])

    // Determine language from file extension
    const language = useMemo(() => languageForFilePath(filePath), [filePath])

    // Expose Next / Previous change functionality to parent container via ref
    useImperativeHandle(
      ref,
      () => ({
        goToNextChange() {
          const diffEditor = diffEditorRef.current
          if (!diffEditor) return

          const changes = diffEditor.getLineChanges()
          if (!changes || changes.length === 0) return

          // Sort changes by modifiedStartLineNumber to be linear
          const sortedChanges = [...changes].sort(
            (a, b) => a.modifiedStartLineNumber - b.modifiedStartLineNumber
          )

          const modifiedEditor = diffEditor.getModifiedEditor()
          const currentLine = modifiedEditor.getPosition()?.lineNumber || 1

          // Find the first change after the current cursor line
          let targetChange = sortedChanges.find((c) => c.modifiedStartLineNumber > currentLine)
          if (!targetChange) {
            // Wrap around to first change
            targetChange = sortedChanges[0]
          }

          if (targetChange) {
            const line = targetChange.modifiedStartLineNumber || 1
            modifiedEditor.revealLineInCenter(line)
            modifiedEditor.setPosition({ lineNumber: line, column: 1 })
            modifiedEditor.focus()
          }
        },
        goToPreviousChange() {
          const diffEditor = diffEditorRef.current
          if (!diffEditor) return

          const changes = diffEditor.getLineChanges()
          if (!changes || changes.length === 0) return

          // Sort changes by modifiedStartLineNumber
          const sortedChanges = [...changes].sort(
            (a, b) => a.modifiedStartLineNumber - b.modifiedStartLineNumber
          )

          const modifiedEditor = diffEditor.getModifiedEditor()
          const currentLine = modifiedEditor.getPosition()?.lineNumber || 1

          // Find the last change before the current cursor line
          const previousChanges = sortedChanges.filter(
            (c) => c.modifiedStartLineNumber < currentLine
          )
          let targetChange = null
          if (previousChanges.length > 0) {
            targetChange = previousChanges[previousChanges.length - 1]
          } else {
            // Wrap around to last change
            targetChange = sortedChanges[sortedChanges.length - 1]
          }

          if (targetChange) {
            const line = targetChange.modifiedStartLineNumber || 1
            modifiedEditor.revealLineInCenter(line)
            modifiedEditor.setPosition({ lineNumber: line, column: 1 })
            modifiedEditor.focus()
          }
        },
        getModifiedValue() {
          const diffEditor = diffEditorRef.current
          if (!diffEditor) return ''
          return diffEditor.getModifiedEditor().getValue()
        },
        setModifiedValue(value: string) {
          diffEditorRef.current?.getModifiedEditor().setValue(value)
        },
      }),
      []
    )

    const editorOptions = useMemo(
      () => ({
        renderSideBySide: viewMode === 'split',
        diffWordWrap: 'inherit' as 'off' | 'on' | 'inherit',
        renderOverviewRuler: true,
        scrollBeyondLastLine: false,
        minimap: { enabled: true },
        glyphMargin: true,
        readOnly: false,
        ignoreTrimWhitespace: ignoreWhitespace,
        hideUnchangedRegions: {
          enabled: collapseUnchanged ?? false,
          revealLineCount: 3,
          contextLineCount: 3,
          minimumLineCount: 3,
        },
      }),
      [viewMode, ignoreWhitespace, collapseUnchanged]
    )

    return (
      <Suspense
        fallback={
          <div className="flex h-full w-full items-center justify-center">
            <span className="text-muted-foreground">Loading Monaco Editor...</span>
          </div>
        }
      >
        {activeTab === 'file' ? (
          <MonacoEditor
            height="100%"
            language={language}
            theme="git-manager-dynamic"
            onMount={(_, monacoInstance) => {
              monacoRef.current = monacoInstance
              registerAndApplyDynamicTheme(monacoInstance)
            }}
            value={modified}
            path={filePath}
            options={{
              readOnly: true,
              minimap: { enabled: true },
              scrollBeyondLastLine: false,
              glyphMargin: true,
            }}
          />
        ) : (
          <MonacoDiffEditor
            height="100%"
            language={language}
            theme="git-manager-dynamic"
            onMount={(editor, monacoInstance) => {
              diffEditorRef.current = editor
              monacoRef.current = monacoInstance
              registerAndApplyDynamicTheme(monacoInstance)
              if (onChangeCount) {
                editor.onDidUpdateDiff(() => onChangeCount(editor.getLineChanges()?.length ?? 0))
              }
            }}
            original={original}
            modified={modified}
            originalModelPath={`${filePath}.orig`}
            modifiedModelPath={`${filePath}.mod`}
            options={editorOptions}
          />
        )}
      </Suspense>
    )
  }
)

MonacoDiffViewer.displayName = 'MonacoDiffViewer'
