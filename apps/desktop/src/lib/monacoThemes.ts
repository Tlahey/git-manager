import * as monaco from 'monaco-editor'

export interface MonacoThemeConfig {
  base: 'vs' | 'vs-dark' | 'hc-black' | 'hc-light'
  inherit: boolean
  rules: monaco.editor.ITokenThemeRule[]
  colors: Record<string, string>
}

// Helper to create hsla string
const hsla = (h: number, s: number, l: number, a: number) => `hsla(${h}, ${s}%, ${l}%, ${a})`
const hsl = (h: number, s: number, l: number) => `hsl(${h}, ${s}%, ${l}%)`

export const monacoThemes: Record<string, MonacoThemeConfig> = {
  'git-manager-dark': {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': hsl(222.2, 84, 4.9),
      'editor.foreground': hsl(210, 40, 98),
      'editor.lineHighlightBackground': hsl(222, 55, 9),
      'editor.selectionBackground': hsla(217.2, 91.2, 59.8, 0.3),
      'editor.inactiveSelectionBackground': hsla(217.2, 32.6, 17.5, 0.5),
      'editor.selectionHighlightBackground': hsla(217.2, 32.6, 17.5, 0.5),
      'editor.findMatchBackground': hsl(217.2, 32.6, 17.5),
      'editor.findMatchHighlightBackground': hsla(217.2, 32.6, 17.5, 0.5),
      'editor.findRangeHighlightBackground': hsla(217.2, 32.6, 17.5, 0.3),
      'editor.hoverHighlightBackground': hsla(217.2, 32.6, 17.5, 0.3),
      'editor.lineHighlightBorder': 'transparent',
      'editorLink.activeForeground': hsl(217.2, 91.2, 59.8),
      'editor.rangeHighlightBackground': hsla(217.2, 32.6, 17.5, 0.3),
      'editor.snippetTabstopHighlightBackground': hsla(217.2, 32.6, 17.5, 0.5),
      'editor.snippetTabstopHighlightBorder': hsl(217.2, 32.6, 17.5),
      'editor.snippetFinalTabstopHighlightBackground': hsla(217.2, 91.2, 59.8, 0.3),
      'editor.snippetFinalTabstopHighlightBorder': hsl(217.2, 91.2, 59.8),
      'editor.wordHighlightBackground': hsla(217.2, 32.6, 17.5, 0.5),
      'editor.wordHighlightStrongBackground': hsla(217.2, 32.6, 17.5, 0.7),
      'editor.wordHighlightTextBackground': hsla(217.2, 32.6, 17.5, 0.5),
      'editorBracketMatch.background': hsl(217.2, 32.6, 17.5),
      'editorBracketMatch.border': hsl(217.2, 91.2, 59.8),
      'editorCursor.foreground': hsl(217.2, 91.2, 59.8),
      'editorWhitespace.foreground': hsl(217.2, 32.6, 17.5),
      'editorIndentGuide.background': hsl(217.2, 32.6, 17.5),
      'editorIndentGuide.activeBackground': hsl(217.2, 32.6, 25),
      'editorLineNumber.foreground': hsl(215, 20.2, 65.1),
      'editorLineNumber.activeForeground': hsl(210, 40, 98),
      'editorRuler.foreground': hsl(217.2, 32.6, 17.5),
      'editorCodeLens.foreground': hsl(215, 20.2, 65.1),
      'editorBracketHighlight.foreground1': hsl(217.2, 91.2, 59.8),
      'editorBracketHighlight.foreground2': hsl(346.5, 87.8, 70.6),
      'editorBracketHighlight.foreground3': hsl(197.1, 100, 74.5),
      'editorInlayHint.background': hsl(217.2, 32.6, 17.5),
      'editorInlayHint.foreground': hsl(215, 20.2, 65.1),
      'editorInlayHint.typeForeground': hsl(210, 40, 98),
      'editorInlayHint.parameterForeground': hsl(210, 40, 98),
      // Diff editor colors
      'diffEditor.insertedTextBackground': hsla(217.2, 91.2, 59.8, 0.2),
      'diffEditor.removedTextBackground': hsla(0, 62.8, 30.6, 0.2),
      'diffEditor.insertedTextBorder': hsla(217.2, 91.2, 59.8, 0.5),
      'diffEditor.removedTextBorder': hsla(0, 62.8, 30.6, 0.5),
      'diffEditorOverview.insertedForeground': hsl(217.2, 91.2, 59.8),
      'diffEditorOverview.removedForeground': hsl(0, 62.8, 30.6),
      'diffEditor.diagonalFill': hsl(217.2, 32.6, 17.5),
      'diffEditor.move.border': hsl(215, 20.2, 65.1),
      'diffEditor.moveActive.border': hsl(217.2, 91.2, 59.8),
    },
  },
  'git-manager-light': {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': 'hsl(0, 0%, 100%)',
      'editor.foreground': 'hsl(222.2, 84%, 4.9%)',
      'editor.lineHighlightBackground': 'hsl(210, 25%, 97%)',
      'editor.selectionBackground': 'hsla(217.2, 91.2%, 59.8%, 0.3)',
      'editor.inactiveSelectionBackground': 'hsla(210, 40%, 96.1%, 0.5)',
      'editor.selectionHighlightBackground': 'hsla(210, 40%, 96.1%, 0.5)',
      'editor.findMatchBackground': 'hsl(210, 40%, 96.1%)',
      'editor.findMatchHighlightBackground': 'hsla(210, 40%, 96.1%, 0.5)',
      'editor.findRangeHighlightBackground': 'hsla(210, 40%, 96.1%, 0.3)',
      'editor.hoverHighlightBackground': 'hsla(210, 40%, 96.1%, 0.3)',
      'editor.lineHighlightBorder': 'transparent',
      'editorLink.activeForeground': 'hsl(217.2, 91.2%, 59.8%)',
      'editor.rangeHighlightBackground': 'hsla(210, 40%, 96.1%, 0.3)',
      'editor.snippetTabstopHighlightBackground': 'hsla(210, 40%, 96.1%, 0.5)',
      'editor.snippetTabstopHighlightBorder': 'hsl(210, 40%, 96.1%)',
      'editor.snippetFinalTabstopHighlightBackground': 'hsla(217.2, 91.2%, 59.8%, 0.3)',
      'editor.snippetFinalTabstopHighlightBorder': 'hsl(217.2, 91.2%, 59.8%)',
      'editor.wordHighlightBackground': 'hsla(210, 40%, 96.1%, 0.5)',
      'editor.wordHighlightStrongBackground': 'hsla(210, 40%, 96.1%, 0.7)',
      'editor.wordHighlightTextBackground': 'hsla(210, 40%, 96.1%, 0.5)',
      'editorBracketMatch.background': 'hsl(210, 40%, 96.1%)',
      'editorBracketMatch.border': 'hsl(217.2, 91.2%, 59.8%)',
      'editorCursor.foreground': 'hsl(217.2, 91.2%, 59.8%)',
      'editorWhitespace.foreground': 'hsl(210, 40%, 96.1%)',
      'editorIndentGuide.background': 'hsl(210, 40%, 96.1%)',
      'editorIndentGuide.activeBackground': 'hsl(210, 40%, 90%)',
      'editorLineNumber.foreground': 'hsl(215.4, 16.3%, 46.9%)',
      'editorLineNumber.activeForeground': 'hsl(222.2, 84%, 4.9%)',
      'editorRuler.foreground': 'hsl(210, 40%, 96.1%)',
      'editorCodeLens.foreground': 'hsl(215.4, 16.3%, 46.9%)',
      'editorBracketHighlight.foreground1': 'hsl(217.2, 91.2%, 59.8%)',
      'editorBracketHighlight.foreground2': 'hsl(346.5, 87.8%, 70.6%)',
      'editorBracketHighlight.foreground3': 'hsl(197.1, 100%, 74.5%)',
      'editorInlayHint.background': 'hsl(210, 40%, 96.1%)',
      'editorInlayHint.foreground': 'hsl(215.4, 16.3%, 46.9%)',
      'editorInlayHint.typeForeground': 'hsl(222.2, 84%, 4.9%)',
      'editorInlayHint.parameterForeground': 'hsl(222.2, 84%, 4.9%)',
      // Diff editor colors
      'diffEditor.insertedTextBackground': 'hsla(217.2, 91.2%, 59.8%, 0.2)',
      'diffEditor.removedTextBackground': 'hsla(0, 84.2%, 60.2%, 0.2)',
      'diffEditor.insertedTextBorder': 'hsla(217.2, 91.2%, 59.8%, 0.5)',
      'diffEditor.removedTextBorder': 'hsla(0, 84.2%, 60.2%, 0.5)',
      'diffEditorOverview.insertedForeground': 'hsl(217.2, 91.2%, 59.8%)',
      'diffEditorOverview.removedForeground': 'hsl(0, 84.2%, 60.2%)',
      'diffEditor.diagonalFill': 'hsl(210, 40%, 96.1%)',
      'diffEditor.move.border': 'hsl(215.4, 16.3%, 46.9%)',
      'diffEditor.moveActive.border': 'hsl(217.2, 91.2%, 59.8%)',
    },
  },
  'git-manager-github-light': {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': 'hsl(0, 0%, 100%)',
      'editor.foreground': 'hsl(222, 6%, 15%)',
      'editor.lineHighlightBackground': 'hsl(210, 17%, 97.6%)',
      'editor.selectionBackground': 'hsla(212, 97%, 45%, 0.3)',
      'editor.inactiveSelectionBackground': 'hsla(210, 17%, 97.6%, 0.5)',
      'editor.selectionHighlightBackground': 'hsla(210, 17%, 97.6%, 0.5)',
      'editor.findMatchBackground': 'hsl(210, 17%, 97.6%)',
      'editor.findMatchHighlightBackground': 'hsla(210, 17%, 97.6%, 0.5)',
      'editor.findRangeHighlightBackground': 'hsla(210, 17%, 97.6%, 0.3)',
      'editor.hoverHighlightBackground': 'hsla(210, 17%, 97.6%, 0.3)',
      'editor.lineHighlightBorder': 'transparent',
      'editorLink.activeForeground': 'hsl(212, 97%, 45%)',
      'editor.rangeHighlightBackground': 'hsla(210, 17%, 97.6%, 0.3)',
      'editor.snippetTabstopHighlightBackground': 'hsla(210, 17%, 97.6%, 0.5)',
      'editor.snippetTabstopHighlightBorder': 'hsl(210, 17%, 97.6%)',
      'editor.snippetFinalTabstopHighlightBackground': 'hsla(212, 97%, 45%, 0.3)',
      'editor.snippetFinalTabstopHighlightBorder': 'hsl(212, 97%, 45%)',
      'editor.wordHighlightBackground': 'hsla(210, 17%, 97.6%, 0.5)',
      'editor.wordHighlightStrongBackground': 'hsla(210, 17%, 97.6%, 0.7)',
      'editor.wordHighlightTextBackground': 'hsla(210, 17%, 97.6%, 0.5)',
      'editorBracketMatch.background': 'hsl(210, 17%, 97.6%)',
      'editorBracketMatch.border': 'hsl(212, 97%, 45%)',
      'editorCursor.foreground': 'hsl(212, 97%, 45%)',
      'editorWhitespace.foreground': 'hsl(210, 17%, 97.6%)',
      'editorIndentGuide.background': 'hsl(210, 17%, 97.6%)',
      'editorIndentGuide.activeBackground': 'hsl(210, 17%, 90%)',
      'editorLineNumber.foreground': 'hsl(210, 9%, 45%)',
      'editorLineNumber.activeForeground': 'hsl(222, 6%, 15%)',
      'editorRuler.foreground': 'hsl(210, 17%, 97.6%)',
      'editorCodeLens.foreground': 'hsl(210, 9%, 45%)',
      'editorBracketHighlight.foreground1': 'hsl(212, 97%, 45%)',
      'editorBracketHighlight.foreground2': 'hsl(346.5, 87.8%, 70.6%)',
      'editorBracketHighlight.foreground3': 'hsl(197.1, 100%, 74.5%)',
      'editorInlayHint.background': 'hsl(210, 17%, 97.6%)',
      'editorInlayHint.foreground': 'hsl(210, 9%, 45%)',
      'editorInlayHint.typeForeground': 'hsl(222, 6%, 15%)',
      'editorInlayHint.parameterForeground': 'hsl(222, 6%, 15%)',
      // Diff editor colors
      'diffEditor.insertedTextBackground': 'hsla(212, 97%, 45%, 0.2)',
      'diffEditor.removedTextBackground': 'hsla(4, 72%, 48%, 0.2)',
      'diffEditor.insertedTextBorder': 'hsla(212, 97%, 45%, 0.5)',
      'diffEditor.removedTextBorder': 'hsla(4, 72%, 48%, 0.5)',
      'diffEditorOverview.insertedForeground': 'hsl(212, 97%, 45%)',
      'diffEditorOverview.removedForeground': 'hsl(4, 72%, 48%)',
      'diffEditor.diagonalFill': 'hsl(210, 17%, 97.6%)',
      'diffEditor.move.border': 'hsl(210, 9%, 45%)',
      'diffEditor.moveActive.border': 'hsl(212, 97%, 45%)',
    },
  },
  'git-manager-github-dark': {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': 'hsl(220, 10%, 7%)',
      'editor.foreground': 'hsl(210, 19%, 92%)',
      'editor.lineHighlightBackground': 'hsl(220, 13%, 11%)',
      'editor.selectionBackground': 'hsla(212, 91%, 57%, 0.3)',
      'editor.inactiveSelectionBackground': 'hsla(216, 11%, 21%, 0.5)',
      'editor.selectionHighlightBackground': 'hsla(216, 11%, 21%, 0.5)',
      'editor.findMatchBackground': 'hsl(216, 11%, 21%)',
      'editor.findMatchHighlightBackground': 'hsla(216, 11%, 21%, 0.5)',
      'editor.findRangeHighlightBackground': 'hsla(216, 11%, 21%, 0.3)',
      'editor.hoverHighlightBackground': 'hsla(216, 11%, 21%, 0.3)',
      'editor.lineHighlightBorder': 'transparent',
      'editorLink.activeForeground': 'hsl(212, 91%, 57%)',
      'editor.rangeHighlightBackground': 'hsla(216, 11%, 21%, 0.3)',
      'editor.snippetTabstopHighlightBackground': 'hsla(216, 11%, 21%, 0.5)',
      'editor.snippetTabstopHighlightBorder': 'hsl(216, 11%, 21%)',
      'editor.snippetFinalTabstopHighlightBackground': 'hsla(212, 91%, 57%, 0.3)',
      'editor.snippetFinalTabstopHighlightBorder': 'hsl(212, 91%, 57%)',
      'editor.wordHighlightBackground': 'hsla(216, 11%, 21%, 0.5)',
      'editor.wordHighlightStrongBackground': 'hsla(216, 11%, 21%, 0.7)',
      'editor.wordHighlightTextBackground': 'hsla(216, 11%, 21%, 0.5)',
      'editorBracketMatch.background': 'hsl(216, 11%, 21%)',
      'editorBracketMatch.border': 'hsl(212, 91%, 57%)',
      'editorCursor.foreground': 'hsl(212, 91%, 57%)',
      'editorWhitespace.foreground': 'hsl(216, 11%, 21%)',
      'editorIndentGuide.background': 'hsl(216, 11%, 21%)',
      'editorIndentGuide.activeBackground': 'hsl(216, 11%, 30%)',
      'editorLineNumber.foreground': 'hsl(215, 14%, 60%)',
      'editorLineNumber.activeForeground': 'hsl(210, 19%, 92%)',
      'editorRuler.foreground': 'hsl(216, 11%, 21%)',
      'editorCodeLens.foreground': 'hsl(215, 14%, 60%)',
      'editorBracketHighlight.foreground1': 'hsl(212, 91%, 57%)',
      'editorBracketHighlight.foreground2': 'hsl(346.5, 87.8%, 70.6%)',
      'editorBracketHighlight.foreground3': 'hsl(197.1, 100%, 74.5%)',
      'editorInlayHint.background': 'hsl(216, 11%, 21%)',
      'editorInlayHint.foreground': 'hsl(215, 14%, 60%)',
      'editorInlayHint.typeForeground': 'hsl(210, 19%, 92%)',
      'editorInlayHint.parameterForeground': 'hsl(210, 19%, 92%)',
      // Diff editor colors
      'diffEditor.insertedTextBackground': 'hsla(212, 91%, 57%, 0.2)',
      'diffEditor.removedTextBackground': 'hsla(4, 66%, 56%, 0.2)',
      'diffEditor.insertedTextBorder': 'hsla(212, 91%, 57%, 0.5)',
      'diffEditor.removedTextBorder': 'hsla(4, 66%, 56%, 0.5)',
      'diffEditorOverview.insertedForeground': 'hsl(212, 91%, 57%)',
      'diffEditorOverview.removedForeground': 'hsl(4, 66%, 56%)',
      'diffEditor.diagonalFill': 'hsl(216, 11%, 21%)',
      'diffEditor.move.border': 'hsl(215, 14%, 60%)',
      'diffEditor.moveActive.border': 'hsl(212, 91%, 57%)',
    },
  },
  'git-manager-nord': {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': 'hsl(220, 16%, 22%)',
      'editor.foreground': 'hsl(218, 27%, 94%)',
      'editor.lineHighlightBackground': 'hsl(222, 16%, 28%)',
      'editor.selectionBackground': 'hsla(193, 43%, 68%, 0.3)',
      'editor.inactiveSelectionBackground': 'hsla(220, 16%, 32%, 0.5)',
      'editor.selectionHighlightBackground': 'hsla(220, 16%, 32%, 0.5)',
      'editor.findMatchBackground': 'hsl(220, 16%, 32%)',
      'editor.findMatchHighlightBackground': 'hsla(220, 16%, 32%, 0.5)',
      'editor.findRangeHighlightBackground': 'hsla(220, 16%, 32%, 0.3)',
      'editor.hoverHighlightBackground': 'hsla(220, 16%, 32%, 0.3)',
      'editor.lineHighlightBorder': 'transparent',
      'editorLink.activeForeground': 'hsl(193, 43%, 68%)',
      'editor.rangeHighlightBackground': 'hsla(220, 16%, 32%, 0.3)',
      'editor.snippetTabstopHighlightBackground': 'hsla(220, 16%, 32%, 0.5)',
      'editor.snippetTabstopHighlightBorder': 'hsl(220, 16%, 32%)',
      'editor.snippetFinalTabstopHighlightBackground': 'hsla(193, 43%, 68%, 0.3)',
      'editor.snippetFinalTabstopHighlightBorder': 'hsl(193, 43%, 68%)',
      'editor.wordHighlightBackground': 'hsla(220, 16%, 32%, 0.5)',
      'editor.wordHighlightStrongBackground': 'hsla(220, 16%, 32%, 0.7)',
      'editor.wordHighlightTextBackground': 'hsla(220, 16%, 32%, 0.5)',
      'editorBracketMatch.background': 'hsl(220, 16%, 32%)',
      'editorBracketMatch.border': 'hsl(193, 43%, 68%)',
      'editorCursor.foreground': 'hsl(193, 43%, 68%)',
      'editorWhitespace.foreground': 'hsl(220, 16%, 32%)',
      'editorIndentGuide.background': 'hsl(220, 16%, 32%)',
      'editorIndentGuide.activeBackground': 'hsl(220, 16%, 40%)',
      'editorLineNumber.foreground': 'hsl(220, 12%, 60%)',
      'editorLineNumber.activeForeground': 'hsl(218, 27%, 94%)',
      'editorRuler.foreground': 'hsl(220, 16%, 32%)',
      'editorCodeLens.foreground': 'hsl(220, 12%, 60%)',
      'editorBracketHighlight.foreground1': 'hsl(193, 43%, 68%)',
      'editorBracketHighlight.foreground2': 'hsl(346.5, 87.8%, 70.6%)',
      'editorBracketHighlight.foreground3': 'hsl(197.1, 100%, 74.5%)',
      'editorInlayHint.background': 'hsl(220, 16%, 32%)',
      'editorInlayHint.foreground': 'hsl(220, 12%, 60%)',
      'editorInlayHint.typeForeground': 'hsl(218, 27%, 94%)',
      'editorInlayHint.parameterForeground': 'hsl(218, 27%, 94%)',
      // Diff editor colors
      'diffEditor.insertedTextBackground': 'hsla(193, 43%, 68%, 0.2)',
      'diffEditor.removedTextBackground': 'hsla(354, 42%, 60%, 0.2)',
      'diffEditor.insertedTextBorder': 'hsla(193, 43%, 68%, 0.5)',
      'diffEditor.removedTextBorder': 'hsla(354, 42%, 60%, 0.5)',
      'diffEditorOverview.insertedForeground': 'hsl(193, 43%, 68%)',
      'diffEditorOverview.removedForeground': 'hsl(354, 42%, 60%)',
      'diffEditor.diagonalFill': 'hsl(220, 16%, 32%)',
      'diffEditor.move.border': 'hsl(220, 12%, 60%)',
      'diffEditor.moveActive.border': 'hsl(193, 43%, 68%)',
    },
  },
  'git-manager-dracula': {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': 'hsl(231, 15%, 18%)',
      'editor.foreground': 'hsl(60, 30%, 96%)',
      'editor.lineHighlightBackground': 'hsl(231, 14%, 21%)',
      'editor.selectionBackground': 'hsla(265, 89%, 78%, 0.3)',
      'editor.inactiveSelectionBackground': 'hsla(232, 14%, 31%, 0.5)',
      'editor.selectionHighlightBackground': 'hsla(232, 14%, 31%, 0.5)',
      'editor.findMatchBackground': 'hsl(232, 14%, 31%)',
      'editor.findMatchHighlightBackground': 'hsla(232, 14%, 31%, 0.5)',
      'editor.findRangeHighlightBackground': 'hsla(232, 14%, 31%, 0.3)',
      'editor.hoverHighlightBackground': 'hsla(232, 14%, 31%, 0.3)',
      'editor.lineHighlightBorder': 'transparent',
      'editorLink.activeForeground': 'hsl(265, 89%, 78%)',
      'editor.rangeHighlightBackground': 'hsla(232, 14%, 31%, 0.3)',
      'editor.snippetTabstopHighlightBackground': 'hsla(232, 14%, 31%, 0.5)',
      'editor.snippetTabstopHighlightBorder': 'hsl(232, 14%, 31%)',
      'editor.snippetFinalTabstopHighlightBackground': 'hsla(265, 89%, 78%, 0.3)',
      'editor.snippetFinalTabstopHighlightBorder': 'hsl(265, 89%, 78%)',
      'editor.wordHighlightBackground': 'hsla(232, 14%, 31%, 0.5)',
      'editor.wordHighlightStrongBackground': 'hsla(232, 14%, 31%, 0.7)',
      'editor.wordHighlightTextBackground': 'hsla(232, 14%, 31%, 0.5)',
      'editorBracketMatch.background': 'hsl(232, 14%, 31%)',
      'editorBracketMatch.border': 'hsl(265, 89%, 78%)',
      'editorCursor.foreground': 'hsl(265, 89%, 78%)',
      'editorWhitespace.foreground': 'hsl(232, 14%, 31%)',
      'editorIndentGuide.background': 'hsl(232, 14%, 31%)',
      'editorIndentGuide.activeBackground': 'hsl(232, 14%, 40%)',
      'editorLineNumber.foreground': 'hsl(232, 35%, 65%)',
      'editorLineNumber.activeForeground': 'hsl(60, 30%, 96%)',
      'editorRuler.foreground': 'hsl(232, 14%, 31%)',
      'editorCodeLens.foreground': 'hsl(232, 35%, 65%)',
      'editorBracketHighlight.foreground1': 'hsl(265, 89%, 78%)',
      'editorBracketHighlight.foreground2': 'hsl(346.5, 87.8%, 70.6%)',
      'editorBracketHighlight.foreground3': 'hsl(197.1, 100%, 74.5%)',
      'editorInlayHint.background': 'hsl(232, 14%, 31%)',
      'editorInlayHint.foreground': 'hsl(232, 35%, 65%)',
      'editorInlayHint.typeForeground': 'hsl(60, 30%, 96%)',
      'editorInlayHint.parameterForeground': 'hsl(60, 30%, 96%)',
      // Diff editor colors
      'diffEditor.insertedTextBackground': 'hsla(265, 89%, 78%, 0.2)',
      'diffEditor.removedTextBackground': 'hsla(0, 100%, 67%, 0.2)',
      'diffEditor.insertedTextBorder': 'hsla(265, 89%, 78%, 0.5)',
      'diffEditor.removedTextBorder': 'hsla(0, 100%, 67%, 0.5)',
      'diffEditorOverview.insertedForeground': 'hsl(265, 89%, 78%)',
      'diffEditorOverview.removedForeground': 'hsl(0, 100%, 67%)',
      'diffEditor.diagonalFill': 'hsl(232, 14%, 31%)',
      'diffEditor.move.border': 'hsl(232, 35%, 65%)',
      'diffEditor.moveActive.border': 'hsl(265, 89%, 78%)',
    },
  },
  'git-manager-catppuccin-mocha': {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': 'hsl(240, 21%, 14%)',
      'editor.foreground': 'hsl(226, 64%, 88%)',
      'editor.lineHighlightBackground': 'hsl(237, 14%, 23%)',
      'editor.selectionBackground': 'hsla(267, 83%, 81%, 0.3)',
      'editor.inactiveSelectionBackground': 'hsla(234, 11%, 31%, 0.5)',
      'editor.selectionHighlightBackground': 'hsla(234, 11%, 31%, 0.5)',
      'editor.findMatchBackground': 'hsl(237, 14%, 23%)',
      'editor.findMatchHighlightBackground': 'hsla(237, 14%, 23%, 0.5)',
      'editor.findRangeHighlightBackground': 'hsla(237, 14%, 23%, 0.3)',
      'editor.hoverHighlightBackground': 'hsla(237, 14%, 23%, 0.3)',
      'editor.lineHighlightBorder': 'transparent',
      'editorLink.activeForeground': 'hsl(267, 83%, 81%)',
      'editor.rangeHighlightBackground': 'hsla(237, 14%, 23%, 0.3)',
      'editor.snippetTabstopHighlightBackground': 'hsla(237, 14%, 23%, 0.5)',
      'editor.snippetTabstopHighlightBorder': 'hsl(237, 14%, 23%)',
      'editor.snippetFinalTabstopHighlightBackground': 'hsla(267, 83%, 81%, 0.3)',
      'editor.snippetFinalTabstopHighlightBorder': 'hsl(267, 83%, 81%)',
      'editor.wordHighlightBackground': 'hsla(237, 14%, 23%, 0.5)',
      'editor.wordHighlightStrongBackground': 'hsla(237, 14%, 23%, 0.7)',
      'editor.wordHighlightTextBackground': 'hsla(237, 14%, 23%, 0.5)',
      'editorBracketMatch.background': 'hsl(237, 14%, 23%)',
      'editorBracketMatch.border': 'hsl(267, 83%, 81%)',
      'editorCursor.foreground': 'hsl(267, 83%, 81%)',
      'editorWhitespace.foreground': 'hsl(237, 14%, 23%)',
      'editorIndentGuide.background': 'hsl(237, 14%, 23%)',
      'editorIndentGuide.activeBackground': 'hsl(237, 14%, 30%)',
      'editorLineNumber.foreground': 'hsl(233, 21%, 63%)',
      'editorLineNumber.activeForeground': 'hsl(226, 64%, 88%)',
      'editorRuler.foreground': 'hsl(237, 14%, 23%)',
      'editorCodeLens.foreground': 'hsl(233, 21%, 63%)',
      'editorBracketHighlight.foreground1': 'hsl(267, 83%, 81%)',
      'editorBracketHighlight.foreground2': 'hsl(346.5, 87.8%, 70.6%)',
      'editorBracketHighlight.foreground3': 'hsl(197.1, 100%, 74.5%)',
      'editorInlayHint.background': 'hsl(237, 14%, 23%)',
      'editorInlayHint.foreground': 'hsl(233, 21%, 63%)',
      'editorInlayHint.typeForeground': 'hsl(226, 64%, 88%)',
      'editorInlayHint.parameterForeground': 'hsl(226, 64%, 88%)',
      // Diff editor colors
      'diffEditor.insertedTextBackground': 'hsla(267, 83%, 81%, 0.2)',
      'diffEditor.removedTextBackground': 'hsla(343, 81%, 75%, 0.2)',
      'diffEditor.insertedTextBorder': 'hsla(267, 83%, 81%, 0.5)',
      'diffEditor.removedTextBorder': 'hsla(343, 81%, 75%, 0.5)',
      'diffEditorOverview.insertedForeground': 'hsl(267, 83%, 81%)',
      'diffEditorOverview.removedForeground': 'hsl(343, 81%, 75%)',
      'diffEditor.diagonalFill': 'hsl(237, 14%, 23%)',
      'diffEditor.move.border': 'hsl(233, 21%, 63%)',
      'diffEditor.moveActive.border': 'hsl(267, 83%, 81%)',
    },
  },
  'git-manager-solarized-light': {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': 'hsl(44, 87%, 94%)',
      'editor.foreground': 'hsl(192, 81%, 14%)',
      'editor.lineHighlightBackground': 'hsl(46, 40%, 88%)',
      'editor.selectionBackground': 'hsla(205, 69%, 49%, 0.3)',
      'editor.inactiveSelectionBackground': 'hsla(46, 40%, 88%, 0.5)',
      'editor.selectionHighlightBackground': 'hsla(46, 40%, 88%, 0.5)',
      'editor.findMatchBackground': 'hsl(46, 40%, 88%)',
      'editor.findMatchHighlightBackground': 'hsla(46, 40%, 88%, 0.5)',
      'editor.findRangeHighlightBackground': 'hsla(46, 40%, 88%, 0.3)',
      'editor.hoverHighlightBackground': 'hsla(46, 40%, 88%, 0.3)',
      'editor.lineHighlightBorder': 'transparent',
      'editorLink.activeForeground': 'hsl(205, 69%, 49%)',
      'editor.rangeHighlightBackground': 'hsla(46, 40%, 88%, 0.3)',
      'editor.snippetTabstopHighlightBackground': 'hsla(46, 40%, 88%, 0.5)',
      'editor.snippetTabstopHighlightBorder': 'hsl(46, 40%, 88%)',
      'editor.snippetFinalTabstopHighlightBackground': 'hsla(205, 69%, 49%, 0.3)',
      'editor.snippetFinalTabstopHighlightBorder': 'hsl(205, 69%, 49%)',
      'editor.wordHighlightBackground': 'hsla(46, 40%, 88%, 0.5)',
      'editor.wordHighlightStrongBackground': 'hsla(46, 40%, 88%, 0.7)',
      'editor.wordHighlightTextBackground': 'hsla(46, 40%, 88%, 0.5)',
      'editorBracketMatch.background': 'hsl(46, 40%, 88%)',
      'editorBracketMatch.border': 'hsl(205, 69%, 49%)',
      'editorCursor.foreground': 'hsl(205, 69%, 49%)',
      'editorWhitespace.foreground': 'hsl(46, 40%, 88%)',
      'editorIndentGuide.background': 'hsl(46, 40%, 88%)',
      'editorIndentGuide.activeBackground': 'hsl(46, 40%, 80%)',
      'editorLineNumber.foreground': 'hsl(194, 14%, 45%)',
      'editorLineNumber.activeForeground': 'hsl(192, 81%, 14%)',
      'editorRuler.foreground': 'hsl(46, 40%, 88%)',
      'editorCodeLens.foreground': 'hsl(194, 14%, 45%)',
      'editorBracketHighlight.foreground1': 'hsl(205, 69%, 49%)',
      'editorBracketHighlight.foreground2': 'hsl(346.5, 87.8%, 70.6%)',
      'editorBracketHighlight.foreground3': 'hsl(197.1, 100%, 74.5%)',
      'editorInlayHint.background': 'hsl(46, 40%, 88%)',
      'editorInlayHint.foreground': 'hsl(194, 14%, 45%)',
      'editorInlayHint.typeForeground': 'hsl(192, 81%, 14%)',
      'editorInlayHint.parameterForeground': 'hsl(192, 81%, 14%)',
      // Diff editor colors
      'diffEditor.insertedTextBackground': 'hsla(205, 69%, 49%, 0.2)',
      'diffEditor.removedTextBackground': 'hsla(1, 71%, 52%, 0.2)',
      'diffEditor.insertedTextBorder': 'hsla(205, 69%, 49%, 0.5)',
      'diffEditor.removedTextBorder': 'hsla(1, 71%, 52%, 0.5)',
      'diffEditorOverview.insertedForeground': 'hsl(205, 69%, 49%)',
      'diffEditorOverview.removedForeground': 'hsl(1, 71%, 52%)',
      'diffEditor.diagonalFill': 'hsl(46, 40%, 88%)',
      'diffEditor.move.border': 'hsl(194, 14%, 45%)',
      'diffEditor.moveActive.border': 'hsl(205, 69%, 49%)',
    },
  },
}

// Function to register all Monaco themes
export function registerMonacoThemes() {
  Object.entries(monacoThemes).forEach(([themeName, themeConfig]) => {
    try {
      monaco.editor.defineTheme(themeName, themeConfig)
    } catch {
      // Theme already defined
    }
  })
}

function hslToHex(h: number, s: number, l: number, a?: number): string {
  s /= 100
  l /= 100

  const k = (n: number) => (n + h / 30) % 12
  const f = (n: number) => {
    const aVal = s * Math.min(l, 1 - l)
    const color = l - aVal * Math.max(Math.min(k(n) - 3, 9 - k(n), 1), -1)
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0')
  }

  const hexRGB = `#${f(0)}${f(8)}${f(4)}`

  if (a !== undefined) {
    const alphaHex = Math.round(a * 255)
      .toString(16)
      .padStart(2, '0')
    return `${hexRGB}${alphaHex}`
  }

  return hexRGB
}

function colorToHex(colorStr: string, alpha?: number): string {
  const clean = colorStr.trim()
  if (clean.startsWith('#')) {
    let hex = clean
    if (hex.length === 4) {
      // e.g. #fff
      hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3]
    }
    if (alpha !== undefined) {
      const alphaHex = Math.round(alpha * 255)
        .toString(16)
        .padStart(2, '0')
      return `${hex.slice(0, 7)}${alphaHex}`
    }
    return hex
  }

  // Parse space-separated HSL components (e.g., "222.2 84% 4.9%")
  const parts = clean.split(/\s+/)
  if (parts.length >= 3) {
    const h = parseFloat(parts[0])
    const s = parseFloat(parts[1].replace('%', ''))
    const l = parseFloat(parts[2].replace('%', ''))
    if (!isNaN(h) && !isNaN(s) && !isNaN(l)) {
      return hslToHex(h, s, l, alpha)
    }
  }

  return clean
}

// Helper to retrieve and format CSS variables as colors
function getMonacoColorFromCssVar(varName: string, alpha?: number): string {
  if (typeof window === 'undefined') return ''
  const rawValue = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
  if (!rawValue) {
    if (varName === '--background') return '#000000'
    if (varName === '--foreground') return '#ffffff'
    return '#888888'
  }

  return colorToHex(rawValue, alpha)
}

function isBackgroundDark(): boolean {
  if (typeof window === 'undefined') return true
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--background').trim()
  const parts = bg.split(/\s+/)
  if (parts.length >= 3) {
    const lightnessStr = parts[2]
    const lightness = parseFloat(lightnessStr)
    if (!isNaN(lightness)) {
      return lightness < 50
    }
  }
  return true // fallback to dark
}

export function registerAndApplyDynamicTheme(monacoInstance: typeof monaco | null | undefined) {
  if (!monacoInstance) return

  const isDark = isBackgroundDark()
  const themeConfig = {
    base: (isDark ? 'vs-dark' : 'vs') as 'vs-dark' | 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': getMonacoColorFromCssVar('--background'),
      'editor.foreground': getMonacoColorFromCssVar('--foreground'),
      'editor.lineHighlightBackground': getMonacoColorFromCssVar('--muted', 0.3),
      'editor.selectionBackground': getMonacoColorFromCssVar('--primary', 0.3),
      'editor.inactiveSelectionBackground': getMonacoColorFromCssVar('--secondary', 0.5),
      'editor.selectionHighlightBackground': getMonacoColorFromCssVar('--secondary', 0.5),
      'editor.findMatchBackground': getMonacoColorFromCssVar('--secondary'),
      'editor.findMatchHighlightBackground': getMonacoColorFromCssVar('--secondary', 0.5),
      'editor.findRangeHighlightBackground': getMonacoColorFromCssVar('--secondary', 0.3),
      'editor.hoverHighlightBackground': getMonacoColorFromCssVar('--secondary', 0.3),
      'editor.lineHighlightBorder': '#00000000',
      'editorLink.activeForeground': getMonacoColorFromCssVar('--primary'),
      'editor.rangeHighlightBackground': getMonacoColorFromCssVar('--secondary', 0.3),
      'editor.snippetTabstopHighlightBackground': getMonacoColorFromCssVar('--secondary', 0.5),
      'editor.snippetTabstopHighlightBorder': getMonacoColorFromCssVar('--secondary'),
      'editor.snippetFinalTabstopHighlightBackground': getMonacoColorFromCssVar('--primary', 0.3),
      'editor.snippetFinalTabstopHighlightBorder': getMonacoColorFromCssVar('--primary'),
      'editor.wordHighlightBackground': getMonacoColorFromCssVar('--secondary', 0.5),
      'editor.wordHighlightStrongBackground': getMonacoColorFromCssVar('--secondary', 0.7),
      'editor.wordHighlightTextBackground': getMonacoColorFromCssVar('--secondary', 0.5),
      'editorBracketMatch.background': getMonacoColorFromCssVar('--secondary'),
      'editorBracketMatch.border': getMonacoColorFromCssVar('--primary'),
      'editorCursor.foreground': getMonacoColorFromCssVar('--primary'),
      'editorWhitespace.foreground': getMonacoColorFromCssVar('--secondary'),
      'editorIndentGuide.background': getMonacoColorFromCssVar('--secondary'),
      'editorIndentGuide.activeBackground': getMonacoColorFromCssVar('--border'),
      'editorLineNumber.foreground': getMonacoColorFromCssVar('--muted-foreground'),
      'editorLineNumber.activeForeground': getMonacoColorFromCssVar('--foreground'),
      'editorRuler.foreground': getMonacoColorFromCssVar('--secondary'),
      'editorCodeLens.foreground': getMonacoColorFromCssVar('--muted-foreground'),
      'editorBracketHighlight.foreground1': getMonacoColorFromCssVar('--primary'),
      'editorBracketHighlight.foreground2': getMonacoColorFromCssVar('--destructive'),
      'editorBracketHighlight.foreground3': getMonacoColorFromCssVar('--muted-foreground'),
      'editorInlayHint.background': getMonacoColorFromCssVar('--secondary'),
      'editorInlayHint.foreground': getMonacoColorFromCssVar('--muted-foreground'),
      'editorInlayHint.typeForeground': getMonacoColorFromCssVar('--foreground'),
      'editorInlayHint.parameterForeground': getMonacoColorFromCssVar('--foreground'),
      // Diff editor colors
      'diffEditor.insertedTextBackground': getMonacoColorFromCssVar('--primary', 0.15),
      'diffEditor.removedTextBackground': getMonacoColorFromCssVar('--destructive', 0.15),
      'diffEditor.insertedTextBorder': getMonacoColorFromCssVar('--primary', 0.4),
      'diffEditor.removedTextBorder': getMonacoColorFromCssVar('--destructive', 0.4),
      'diffEditorOverview.insertedForeground': getMonacoColorFromCssVar('--primary'),
      'diffEditorOverview.removedForeground': getMonacoColorFromCssVar('--destructive'),
      'diffEditor.diagonalFill': getMonacoColorFromCssVar('--secondary'),
      'diffEditor.move.border': getMonacoColorFromCssVar('--border'),
      'diffEditor.moveActive.border': getMonacoColorFromCssVar('--primary'),
    },
  }

  try {
    monacoInstance.editor.defineTheme('git-manager-dynamic', themeConfig)
    monacoInstance.editor.setTheme('git-manager-dynamic')
  } catch (error) {
    console.error('Failed to define or apply dynamic Monaco theme', error)
  }
}
