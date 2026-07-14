import { lazy } from 'react'
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'

// Configure @monaco-editor/react loader to use the local monaco instance — shared module-level
// side effect so every Monaco consumer (diff viewer, 3-pane merge editor) configures it exactly
// once instead of racing to call loader.config() from multiple components.
loader.config({ monaco })

// Shared lazy-loaded references so every Monaco consumer resolves the same dynamic import
// chunk instead of each component triggering its own separate `import('@monaco-editor/react')`.
export const MonacoEditor = lazy(() => import('@monaco-editor/react'))
export const MonacoDiffEditor = lazy(() =>
  import('@monaco-editor/react').then((module) => ({ default: module.DiffEditor }))
)

const LANGUAGE_MAP: Record<string, string> = {
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

export function languageForFilePath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  return LANGUAGE_MAP[ext] || 'text'
}
