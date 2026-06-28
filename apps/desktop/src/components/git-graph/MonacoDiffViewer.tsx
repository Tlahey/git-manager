import { lazy, Suspense, useMemo } from 'react'
import type { GitDiffFile } from '@git-manager/git-types'

// Lazy load Monaco Diff Editor to avoid initial bundle bloat
const MonacoDiffEditor = lazy(() => import('@monaco-editor/react').then(module => ({
  default: module.DiffEditor
})))

interface MonacoDiffViewerProps {
  file: GitDiffFile
  viewMode: 'inline' | 'split'
}

export function MonacoDiffViewer({ file, viewMode }: MonacoDiffViewerProps) {
  // Extract original and modified content from diff hunks
  const { originalContent, modifiedContent, language } = useMemo(() => {
    let originalLines: string[] = []
    let modifiedLines: string[] = []

    file.hunks.forEach(hunk => {
      hunk.lines.forEach(line => {
        if (line.origin === '+' || line.origin === ' ') {
          modifiedLines.push(line.content)
        }
        if (line.origin === '-' || line.origin === ' ') {
          originalLines.push(line.content)
        }
      })
    })

    // Determine language from file extension
    const ext = file.newPath.split('.').pop()?.toLowerCase() || ''
    const languageMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      py: 'python',
      rs: 'rust',
      css: 'css',
      html: 'html',
      md: 'markdown',
      json: 'json',
      sh: 'shellscript',
    }
    const lang = languageMap[ext] || 'text'

    return {
      originalContent: originalLines.join('\n') + '\n',
      modifiedContent: modifiedLines.join('\n') + '\n',
      language: lang
    }
  }, [file])

  const editorOptions = useMemo(() => ({
    renderSideBySide: viewMode === 'split',
    diffWordWrap: 'inherit' as 'off' | 'on' | 'inherit',
    renderOverviewRuler: true,
    scrollBeyondLastLine: false,
    minimap: { enabled: true },
    glyphMargin: true,
    readOnly: false,
  }), [viewMode])

  return (
    <Suspense fallback={
      <div className="flex h-full w-full items-center justify-center">
        <span className="text-muted-foreground">Loading Monaco Editor...</span>
      </div>
    }>
      <MonacoDiffEditor
        height="100%"
        language={language}
        original={originalContent}
        modified={modifiedContent}
        originalModelPath={`${file.oldPath}.orig`}
        modifiedModelPath={`${file.newPath}.mod`}
        options={editorOptions}
      />
    </Suspense>
  )
}