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

// Extension -> Monaco language id. Values must be ids Monaco actually registers (see each
// language's `basic-languages/*/*.contribution.ts` upstream) — an unregistered id (the previous
// `sh: 'shellscript'`, Monaco registers shell scripts as `'shell'`) silently renders as
// untokenized plain text instead of erroring, so a typo here is invisible without a screenshot.
const LANGUAGE_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  cts: 'typescript',
  mts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  rs: 'rust',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  htm: 'html',
  md: 'markdown',
  json: 'json',
  sh: 'shell',
  bash: 'shell',
  yaml: 'yaml',
  yml: 'yaml',
  xml: 'xml',
  svg: 'xml',
  ini: 'ini',
  properties: 'ini',
  toml: 'ini',
  dockerfile: 'dockerfile',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hh: 'cpp',
  cs: 'csharp',
  go: 'go',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  php: 'php',
  rb: 'ruby',
  swift: 'swift',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  lua: 'lua',
  pl: 'perl',
  pm: 'perl',
  ps1: 'powershell',
  psm1: 'powershell',
  scala: 'scala',
  r: 'r',
  fs: 'fsharp',
  fsx: 'fsharp',
  ex: 'elixir',
  exs: 'elixir',
  clj: 'clojure',
  cljs: 'clojure',
  dart: 'dart',
}

export function languageForFilePath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  return LANGUAGE_MAP[ext] || 'text'
}
