// ─── Monaco editor token map ────────────────────────────────────────────────
//
// The live editor theme is derived at runtime from the same CSS custom
// properties that drive the rest of the UI (see themes.css), so the editor
// always matches the active app theme without a hand-maintained per-theme
// Monaco palette.  This module owns the *declarative* mapping of Monaco color
// keys to CSS tokens; the DOM read (`getComputedStyle`) and the
// `monaco.editor.defineTheme` call live in packages/editor, which owns the
// monaco instance — keeping this package framework-free.

export interface MonacoTokenBinding {
  /** Monaco theme color key, e.g. `'editor.background'`. */
  key: string
  /** CSS custom property to resolve (with leading `--`), e.g. `'--primary'`. */
  cssVar?: string
  /** Optional alpha 0..1 applied to the resolved color. */
  alpha?: number
  /** A constant color literal, used instead of a CSS var (e.g. transparent). */
  constant?: string
}

/**
 * Bindings for the runtime-derived `git-manager-dynamic` Monaco theme, in the
 * exact order they were previously declared inline in packages/editor.  Consumers
 * resolve each `cssVar` against the document (applying `alpha`) or use `constant`
 * verbatim.
 */
export const MONACO_DYNAMIC_TOKEN_MAP: MonacoTokenBinding[] = [
  { key: 'editor.background', cssVar: '--background' },
  { key: 'editor.foreground', cssVar: '--foreground' },
  { key: 'editor.lineHighlightBackground', cssVar: '--muted', alpha: 0.3 },
  { key: 'editor.selectionBackground', cssVar: '--primary', alpha: 0.3 },
  { key: 'editor.inactiveSelectionBackground', cssVar: '--secondary', alpha: 0.5 },
  { key: 'editor.selectionHighlightBackground', cssVar: '--secondary', alpha: 0.5 },
  { key: 'editor.findMatchBackground', cssVar: '--secondary' },
  { key: 'editor.findMatchHighlightBackground', cssVar: '--secondary', alpha: 0.5 },
  { key: 'editor.findRangeHighlightBackground', cssVar: '--secondary', alpha: 0.3 },
  { key: 'editor.hoverHighlightBackground', cssVar: '--secondary', alpha: 0.3 },
  { key: 'editor.lineHighlightBorder', constant: '#00000000' },
  { key: 'editorLink.activeForeground', cssVar: '--primary' },
  { key: 'editor.rangeHighlightBackground', cssVar: '--secondary', alpha: 0.3 },
  { key: 'editor.snippetTabstopHighlightBackground', cssVar: '--secondary', alpha: 0.5 },
  { key: 'editor.snippetTabstopHighlightBorder', cssVar: '--secondary' },
  { key: 'editor.snippetFinalTabstopHighlightBackground', cssVar: '--primary', alpha: 0.3 },
  { key: 'editor.snippetFinalTabstopHighlightBorder', cssVar: '--primary' },
  { key: 'editor.wordHighlightBackground', cssVar: '--secondary', alpha: 0.5 },
  { key: 'editor.wordHighlightStrongBackground', cssVar: '--secondary', alpha: 0.7 },
  { key: 'editor.wordHighlightTextBackground', cssVar: '--secondary', alpha: 0.5 },
  { key: 'editorBracketMatch.background', cssVar: '--secondary' },
  { key: 'editorBracketMatch.border', cssVar: '--primary' },
  { key: 'editorCursor.foreground', cssVar: '--primary' },
  { key: 'editorWhitespace.foreground', cssVar: '--secondary' },
  { key: 'editorIndentGuide.background', cssVar: '--secondary' },
  { key: 'editorIndentGuide.activeBackground', cssVar: '--border' },
  { key: 'editorLineNumber.foreground', cssVar: '--muted-foreground' },
  { key: 'editorLineNumber.activeForeground', cssVar: '--foreground' },
  { key: 'editorRuler.foreground', cssVar: '--secondary' },
  { key: 'editorCodeLens.foreground', cssVar: '--muted-foreground' },
  { key: 'editorBracketHighlight.foreground1', cssVar: '--primary' },
  { key: 'editorBracketHighlight.foreground2', cssVar: '--destructive' },
  { key: 'editorBracketHighlight.foreground3', cssVar: '--muted-foreground' },
  { key: 'editorInlayHint.background', cssVar: '--secondary' },
  { key: 'editorInlayHint.foreground', cssVar: '--muted-foreground' },
  { key: 'editorInlayHint.typeForeground', cssVar: '--foreground' },
  { key: 'editorInlayHint.parameterForeground', cssVar: '--foreground' },
  // Diff editor colors
  { key: 'diffEditor.insertedTextBackground', cssVar: '--primary', alpha: 0.15 },
  { key: 'diffEditor.removedTextBackground', cssVar: '--destructive', alpha: 0.15 },
  { key: 'diffEditor.insertedTextBorder', cssVar: '--primary', alpha: 0.4 },
  { key: 'diffEditor.removedTextBorder', cssVar: '--destructive', alpha: 0.4 },
  { key: 'diffEditorOverview.insertedForeground', cssVar: '--primary' },
  { key: 'diffEditorOverview.removedForeground', cssVar: '--destructive' },
  { key: 'diffEditor.diagonalFill', cssVar: '--secondary' },
  { key: 'diffEditor.move.border', cssVar: '--border' },
  { key: 'diffEditor.moveActive.border', cssVar: '--primary' },
]
